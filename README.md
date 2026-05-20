# 📚 AI Quiz Generator with Google Gemini

An intelligent quiz generation web application that allows users to upload PDF documents or images and automatically generates:

- 📘 Easy-to-understand summaries
- 🔑 Key points
- 📝 Multiple-choice quiz questions
- 🎤 Voice narration for summaries and questions
- 📊 Automatic scoring
- 🤖 AI-powered performance review and study tips

Built using Python, Flask, and Google Gemini API.

---

## 🚀 Features

- Upload PDF or image files
- Extract text from PDFs
- Analyze images using Gemini Vision
- Generate summaries and key points
- Create multiple-choice quizzes automatically
- Text-to-speech for summaries and questions
- Accurate answer evaluation
- Personalized feedback and study tips
- Beautiful responsive UI

---

## 🛠️ Tech Stack

### Backend
- Python
- Flask
- Google Gemini API
- PyPDF2
- Pillow

### Frontend
- HTML
- CSS
- JavaScript
- Browser Speech Synthesis API

---

## 📂 Project Structure


```text
Quiz/
├── app.py
├── requirements.txt
├── uploads/
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── script.js


⚙️ Installation Guide
1. Clone the Repository

git clone https://github.com/yoursudaycharan/SmartQuizAI.git
cd SmartQuizAI


2. Create Virtual Environment
python -m venv venv


3. Activate Virtual Environment

Windows (Command Prompt)
venv\Scripts\activate

Windows (PowerShell)
venv\Scripts\Activate.ps1

Linux/macOS
source venv/bin/activate


4. Install Dependencies
pip install -r requirements.txt


5. Create Gemini API Key

Get a free API key from:

https://aistudio.google.com/app/apikey

6. Set Environment Variable

Windows CMD
set GEMINI_API_KEY=your_api_key_here

PowerShell
$env:GEMINI_API_KEY="your_api_key_here"

Linux/macOS
export GEMINI_API_KEY="your_api_key_here"


7. Run the Application
python app.py


8. Open in Browser
http://127.0.0.1:5000



