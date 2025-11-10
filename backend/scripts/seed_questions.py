import requests
import time

QUESTIONS = [
"What's the weirdest food you've eaten?",
"Describe your day in one emoji.",
"What's a secret talent you have?",
"Give a one-sentence horror story.",
"If you were a superhero, what would be your useless power?"
]

print("Seeding via backend admin endpoint... (wait for containers to be up)")
time.sleep(3)
try:
    resp = requests.post("http://localhost:8000/admin/questions/import", json={"questions": QUESTIONS})
    print(resp.status_code, resp.text)
except Exception as e:
    print("Failed to seed:", e)
