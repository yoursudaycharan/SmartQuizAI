import os
import json
import re
import warnings
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from PyPDF2 import PdfReader
from PIL import Image
import google.generativeai as genai

warnings.filterwarnings("ignore", category=FutureWarning)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024
os.makedirs('uploads', exist_ok=True)

ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'webp'}

API_KEY = os.getenv('GEMINI_API_KEY')
if not API_KEY:
    raise ValueError('Please set the GEMINI_API_KEY environment variable')

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_pdf_text(path):
    reader = PdfReader(path)
    pages = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            pages.append(t)
    return '\n'.join(pages).strip()


def clean_json_string(raw):
    """Remove markdown fences so json.loads can parse the response."""
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'```$', '', raw)
    return raw.strip()


# ──────────────────────────────────────────────────────────────────
# GENERATE QUIZ  –  single Gemini call, asks for JSON directly
# ──────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/generate-quiz', methods=['POST'])
def generate_quiz():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    if not allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'Unsupported file type. Use PDF, PNG, JPG or WEBP'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    num_questions = int(request.form.get('num_questions', 5))
    difficulty    = request.form.get('difficulty', 'medium')

    # ── Build the prompt ──────────────────────────────────────────
    prompt = f"""You are an expert quiz creator.
Analyse the provided content and respond with ONLY a single valid JSON object — no markdown fences,
no explanation text, nothing before or after the JSON.

Generate EXACTLY {num_questions} multiple-choice questions at {difficulty} difficulty.

STRICT RULES:
1. Each question has exactly 4 options (plain text, no "A)" prefixes).
2. "correct_answer" must be copied VERBATIM — character-for-character — from the "options" array.
3. "summary" must be 3-4 plain-English sentences a beginner can understand.
4. "key_points" must have exactly 5 items.
5. Return ONLY the JSON — nothing else.

Required JSON format:
{{
  "topic": "Short topic title",
  "summary": "3-4 sentence plain-English summary.",
  "key_points": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "questions": [
    {{
      "id": 1,
      "question": "Full question text?",
      "options": ["First option", "Second option", "Third option", "Fourth option"],
      "correct_answer": "First option",
      "explanation": "Why this is correct."
    }}
  ]
}}"""

    try:
        if filename.lower().endswith('.pdf'):
            content = extract_pdf_text(filepath)
            if not content:
                return jsonify({'success': False,
                                'error': 'Could not extract text. Is this a scanned/image PDF?'}), 400
            full_prompt = prompt + f"\n\nCONTENT TO USE:\n{content[:15000]}"
            response = model.generate_content(full_prompt)
        else:
            img = Image.open(filepath)
            response = model.generate_content([prompt, img])

        raw  = clean_json_string(response.text)
        quiz = json.loads(raw)

        # ── Sanity-check the JSON ─────────────────────────────────
        for q in quiz.get('questions', []):
            opts   = q.get('options', [])
            answer = q.get('correct_answer', '')
            # If AI broke rule 2, find the closest matching option and fix it
            if answer not in opts:
                match = next(
                    (o for o in opts if o.strip().lower() == answer.strip().lower()),
                    None
                )
                if match:
                    q['correct_answer'] = match
                else:
                    # Last resort: pick first option so the quiz is still usable
                    q['correct_answer'] = opts[0] if opts else answer

        return jsonify({'success': True, 'quiz': quiz})

    except json.JSONDecodeError as e:
        snippet = response.text[:400] if 'response' in dir() else 'no response'
        return jsonify({'success': False,
                        'error': f'AI returned invalid JSON: {e}. Snippet: {snippet}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ──────────────────────────────────────────────────────────────────
# REVIEW ANSWERS  –  exact match scoring, per-question breakdown
# ──────────────────────────────────────────────────────────────────
@app.route('/api/review-answers', methods=['POST'])
def review_answers():
    data    = request.get_json()
    quiz    = data.get('quiz')
    answers = data.get('answers', {})

    if not quiz:
        return jsonify({'success': False, 'error': 'Quiz data missing'}), 400

    questions = quiz.get('questions', [])
    total = len(questions)
    score = 0
    analysis = []

    for q in questions:
        qid          = str(q['id'])
        user_answer  = answers.get(qid, '')
        correct      = q['correct_answer']

        # ── EXACT match only (strip whitespace + ignore case) ──────
        is_correct = user_answer.strip().lower() == correct.strip().lower()
        if is_correct:
            score += 1

        analysis.append({
            'id':             q['id'],
            'question':       q['question'],
            'user_answer':    user_answer or 'Not answered',
            'correct_answer': correct,
            'is_correct':     is_correct,
            'explanation':    q.get('explanation', '')
        })

    percentage = round((score / total) * 100) if total else 0

    # ── Ask Gemini for written review ─────────────────────────────
    review_prompt = f"""A student scored {score}/{total} ({percentage}%) on a quiz about "{quiz.get('topic', 'the topic')}".

Per-question results:
{json.dumps(analysis, indent=2)}

Reply with ONLY valid JSON — no markdown, no extra text.
{{
  "performance_level": "Excellent | Good | Fair | Needs Improvement",
  "overall_feedback": "2-3 encouraging sentences mentioning their score",
  "strengths": ["specific strength 1", "specific strength 2"],
  "areas_to_improve": ["specific area 1", "specific area 2"],
  "study_tips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],
  "encouragement": "One motivating closing sentence"
}}"""

    try:
        resp   = model.generate_content(review_prompt)
        review = json.loads(clean_json_string(resp.text))
    except Exception:
        # Fallback so the UI still works even if Gemini fails here
        review = {
            'performance_level': 'Good' if percentage >= 60 else 'Needs Improvement',
            'overall_feedback':  f'You scored {score} out of {total} ({percentage}%). '
                                 'Check the explanations for each question below.',
            'strengths':         ['Completed the full quiz', 'Engaged with the material'],
            'areas_to_improve':  ['Review the questions you got wrong'],
            'study_tips':        ['Re-read the source material',
                                  'Focus on the explanations for wrong answers',
                                  'Try the quiz again after studying'],
            'encouragement':     'Every attempt makes you better — keep going!'
        }

    review['score']      = score
    review['total']      = total
    review['percentage'] = percentage
    review['analysis']   = analysis   # per-question detail for the frontend

    return jsonify({'success': True, 'review': review})


if __name__ == '__main__':
    app.run(debug=True)