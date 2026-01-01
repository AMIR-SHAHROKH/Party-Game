# Quick Start Guide - Party Q&A Game Frontend Integration

## 📋 What You Need to Do

### Step 1: Copy Frontend Files (5 minutes)

1. **Create frontend folder structure:**
```bash
mkdir -p frontend
```

2. **Copy your HTML file to frontend:**
```bash
cp your-html-file.html frontend/index.html
```

3. **Create `frontend/Dockerfile`:**
```dockerfile
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

4. **Create `frontend/nginx.conf`** (use the one from integration-guide.md)

---

### Step 2: Update Your Backend (10 minutes)

Add this to your `backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Your existing imports...

# Add CORS middleware (add this right after creating app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend (add this before your routes)
@app.get("/", response_class=FileResponse)
async def serve_frontend():
    return "frontend/index.html"
```

---

### Step 3: Create Docker Compose (5 minutes)

Create `docker-compose.yml` in your project root:

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: party-game-frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: party-game-backend
    ports:
      - "8000:8000"
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/party_game
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    container_name: party-game-db
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=party_game
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

### Step 4: Update Frontend JavaScript (10 minutes)

Replace the `<script>` section in `frontend/index.html` with the code from `api-integration.md`

Key changes:
- Add `apiUrl` configuration
- Update `startGame()` to call backend API
- Add `loadQuestion()` function
- Add `submitAnswer()` function to POST to backend
- Add `submitVotes()` function
- Add WebSocket support for real-time updates

---

### Step 5: Run Everything (2 minutes)

```bash
# From project root
docker-compose up --build

# Access:
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Documentation: http://localhost:8000/docs
# Database: localhost:5432
```

---

## ✅ Verification Checklist

- [ ] `docker-compose up` runs without errors
- [ ] Frontend loads at `http://localhost:3000`
- [ ] Backend API docs available at `http://localhost:8000/docs`
- [ ] Can see network requests in browser DevTools
- [ ] API calls are working (check Network tab)
- [ ] No CORS errors in console
- [ ] WebSocket connects successfully

---

## 🔧 Troubleshooting

### CORS Error
**Error:** `Access to XMLHttpRequest at 'http://localhost:8000' blocked by CORS policy`

**Fix:** Ensure CORS middleware is in main.py:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Connection Refused
**Error:** `Failed to fetch from http://localhost:8000/api/games`

**Fix:** Make sure backend is running:
```bash
docker ps  # Check if backend container is running
docker logs party-game-backend  # View backend logs
```

### Static Files Not Found
**Error:** `nginx: [error] unable to open /etc/nginx/nginx.conf`

**Fix:** Ensure `frontend/nginx.conf` exists and is copied to Dockerfile

### Port Already In Use
**Error:** `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Fix:** Change ports in docker-compose.yml:
```yaml
frontend:
  ports:
    - "3001:3000"  # Use 3001 instead of 3000
```

---

## 📁 Final Project Structure

```
party-game/
├── backend/
│   ├── main.py                    (Updated with CORS & file serving)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── ...other files...
│
├── frontend/
│   ├── index.html                 (Your updated HTML with new JS)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── ...other static files...
│
├── docker-compose.yml             (New file - orchestrates all services)
└── README.md
```

---

## 🚀 What Happens When You Start

1. **Docker Compose starts 3 containers:**
   - Nginx (frontend) - port 3000
   - FastAPI (backend) - port 8000
   - PostgreSQL (database) - port 5432

2. **User visits `http://localhost:3000`:**
   - Nginx serves `index.html`
   - HTML loads, browser renders the page
   - JavaScript initializes

3. **User clicks "Create Game":**
   - Frontend sends POST to `http://localhost:8000/api/games`
   - Backend creates game in database
   - Backend returns `game_id`
   - Frontend stores `game_id` and continues

4. **Real-time updates:**
   - WebSocket connection established to `/ws/game/{game_id}`
   - When all players submit answers, backend sends via WebSocket
   - Frontend switches to voting phase automatically

---

## 📡 API Endpoints Your Backend Must Support

Minimum required endpoints:

```
POST   /api/games
       Body: { creator_name, creator_avatar }
       Response: { game_id, player_id }

POST   /api/games/{game_id}/join
       Body: { player_name, player_avatar }
       Response: { game_id, player_id }

GET    /api/games/{game_id}/question
       Response: { question, question_number, total_questions }

POST   /api/games/{game_id}/answer
       Body: { player_id, answer, question_id }
       Response: { status: "submitted" }

POST   /api/games/{game_id}/vote
       Body: { player_id, voted_answer_id, question_id }
       Response: { status: "voted" }

GET    /api/games/{game_id}/results
       Response: { leaderboard: [{name, avatar, score, ...}] }

WS     /ws/game/{game_id}
       Messages: { type: "answers_ready", "voting_complete", ... }
```

---

## 💡 Pro Tips

1. **Test API with Swagger UI:** Visit `http://localhost:8000/docs`
2. **View container logs:** `docker logs party-game-backend`
3. **Access database:** `psql -U user -d party_game -h localhost`
4. **Rebuild only frontend:** `docker-compose up --build frontend`
5. **Clear database:** `docker volume rm party-game_postgres_data`

---

## 🎯 Next Steps

1. Implement the API endpoints in your backend
2. Connect to your actual database
3. Test with multiple users
4. Deploy to production (use environment variables)
5. Add WebSocket support for real-time features

---

**Need help?** Check the other guides:
- `integration-guide.md` - Detailed setup instructions
- `api-integration.md` - JavaScript API code
