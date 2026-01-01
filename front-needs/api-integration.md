# Frontend API Integration Code

This file contains the JavaScript code to replace in your HTML for backend integration.

## Add this to your HTML `<script>` section:

```javascript
const app = {
    // Configuration
    apiUrl: window.location.hostname === 'localhost' 
        ? 'http://localhost:8000' 
        : window.location.origin,
    
    // State management
    currentMode: null,
    selectedAvatar: '😎',
    playerName: 'Player',
    currentPhase: 'answering', // 'answering' or 'voting'
    userAnswer: '',
    selectedVoteId: null,
    allAnswers: [],
    questionIndex: 0,
    gameId: null,
    playerId: null,
    
    // Initialize WebSocket for real-time updates
    initWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/game/${this.gameId}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
        }
    },
    
    handleWebSocketMessage(data) {
        switch(data.type) {
            case 'answers_ready':
                // Switch to voting phase
                this.switchToVoting(data.answers);
                break;
            case 'voting_complete':
                // Go to results
                this.displayResults(data.results);
                break;
            case 'players_updated':
                // Update player list
                this.updatePlayerList(data.players);
                break;
        }
    },
    
    // Page navigation
    showPage(pageIndex) {
        document.querySelectorAll('.page').forEach((page, index) => {
            page.classList.toggle('active', index === pageIndex);
        });
    },

    goToLanding() {
        this.showPage(0);
        document.getElementById('header-subtitle').textContent = 'Welcome to the ultimate party game!';
    },

    goToPlayerSetup(mode) {
        this.currentMode = mode;
        this.showPage(1);
        const gameCodeInput = document.getElementById('gameCodeInput');
        if (mode === 'join') {
            gameCodeInput.style.display = 'block';
            document.getElementById('header-subtitle').textContent = 'Join a game with your friends';
        } else {
            gameCodeInput.style.display = 'none';
            document.getElementById('header-subtitle').textContent = 'Create a new game';
        }
    },

    selectAvatar(element, emoji) {
        document.querySelectorAll('.avatar-option').forEach(el => {
            el.classList.remove('selected');
        });
        element.classList.add('selected');
        this.selectedAvatar = emoji;
    },

    async startGame() {
        this.playerName = document.getElementById('playerName').value || 'Player';
        
        try {
            if (this.currentMode === 'create') {
                // Create new game
                const response = await fetch(`${this.apiUrl}/api/games`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        creator_name: this.playerName,
                        creator_avatar: this.selectedAvatar
                    })
                });
                
                const data = await response.json();
                this.gameId = data.game_id;
                this.playerId = data.player_id;
                
            } else {
                // Join existing game
                const gameCode = document.getElementById('joinCode').value;
                const response = await fetch(`${this.apiUrl}/api/games/${gameCode}/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        player_name: this.playerName,
                        player_avatar: this.selectedAvatar
                    })
                });
                
                const data = await response.json();
                this.gameId = data.game_id;
                this.playerId = data.player_id;
            }
            
            this.showPage(2);
            document.getElementById('header-subtitle').textContent = `Game: ${this.gameId} - ${this.playerName}`;
            
            // Initialize WebSocket for real-time updates
            this.initWebSocket();
            
            // Load first question
            this.loadQuestion();
            this.startTimer();
            
        } catch (error) {
            console.error('Error starting game:', error);
            alert('Failed to start game. Please try again.');
        }
    },

    async loadQuestion() {
        try {
            const response = await fetch(`${this.apiUrl}/api/games/${this.gameId}/question`, {
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            // Update question display
            document.querySelector('.question-number').textContent = 
                `Question ${data.question_number} of ${data.total_questions}`;
            document.querySelector('.question-text').textContent = data.question;
            
            // Reset answer input
            document.getElementById('answerText').value = '';
            document.getElementById('charCount').textContent = '0';
            
            // Show answer input phase
            document.getElementById('answerInputPhase').style.display = 'block';
            document.getElementById('votingPhase').style.display = 'none';
            this.currentPhase = 'answering';
            
            // Reset character counter
            this.setupCharacterCounter();
            
        } catch (error) {
            console.error('Error loading question:', error);
        }
    },

    setupCharacterCounter() {
        const textarea = document.getElementById('answerText');
        const charCount = document.getElementById('charCount');
        
        textarea.addEventListener('input', () => {
            charCount.textContent = textarea.value.length;
        });
    },

    async submitAnswer() {
        const answerText = document.getElementById('answerText').value.trim();
        
        if (!answerText) {
            alert('Please enter an answer');
            return;
        }
        
        if (answerText.length < 5) {
            alert('Answer must be at least 5 characters');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/api/games/${this.gameId}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    player_id: this.playerId,
                    answer: answerText,
                    question_id: this.questionIndex
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'submitted') {
                console.log('Answer submitted successfully');
                // Wait for other players' answers (handled via WebSocket)
            }
            
        } catch (error) {
            console.error('Error submitting answer:', error);
            alert('Failed to submit answer. Please try again.');
        }
    },

    async switchToVoting(answersData) {
        this.allAnswers = answersData || [];
        this.currentPhase = 'voting';
        
        // Hide answer input, show voting phase
        document.getElementById('answerInputPhase').style.display = 'none';
        document.getElementById('votingPhase').style.display = 'block';
        
        // Display answers
        this.displayAnswersForVoting();
    },

    displayAnswersForVoting() {
        const votingList = document.getElementById('answersVotingList');
        votingList.innerHTML = '';
        
        this.allAnswers.forEach((answer, index) => {
            const answerCard = document.createElement('div');
            answerCard.className = 'answer-voting-card';
            answerCard.dataset.answerId = answer.id;
            answerCard.dataset.index = index;
            
            answerCard.innerHTML = `
                <div class="vote-checkbox">✓</div>
                <div class="answer-text-content">
                    <div class="answer-content">${escapeHtml(answer.text)}</div>
                    <div class="answer-author">Anonymous - ${answer.author_avatar}</div>
                </div>
            `;
            
            answerCard.addEventListener('click', () => {
                document.querySelectorAll('.answer-voting-card').forEach(card => {
                    card.classList.remove('selected');
                });
                answerCard.classList.add('selected');
                this.selectedVoteId = answer.id;
            });
            
            votingList.appendChild(answerCard);
        });
    },

    async submitVotes() {
        if (!this.selectedVoteId) {
            alert('Please select an answer to vote for');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/api/games/${this.gameId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    player_id: this.playerId,
                    voted_answer_id: this.selectedVoteId,
                    question_id: this.questionIndex
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'voted') {
                // Move to next question or results (handled via WebSocket)
                this.questionIndex++;
                
                if (this.questionIndex < 10) { // Assuming 10 questions total
                    await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
                    this.loadQuestion();
                } else {
                    this.loadResults();
                }
            }
            
        } catch (error) {
            console.error('Error submitting vote:', error);
            alert('Failed to submit vote. Please try again.');
        }
    },

    async loadResults() {
        try {
            const response = await fetch(`${this.apiUrl}/api/games/${this.gameId}/results`, {
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            this.displayResults(data.leaderboard);
            
        } catch (error) {
            console.error('Error loading results:', error);
        }
    },

    displayResults(leaderboard) {
        this.showPage(3);
        document.getElementById('header-subtitle').textContent = 'Game Complete!';
        
        const leaderboardContainer = document.querySelector('.leaderboard');
        leaderboardContainer.innerHTML = '';
        
        leaderboard.forEach((player, index) => {
            const rank = index + 1;
            let rankClass = 'other';
            if (rank === 1) rankClass = 'rank-1';
            if (rank === 2) rankClass = 'rank-2';
            if (rank === 3) rankClass = 'rank-3';
            
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            item.innerHTML = `
                <div class="rank-badge ${rankClass}">${rank}</div>
                <div class="leaderboard-info">
                    <div class="leaderboard-name">${escapeHtml(player.avatar)} ${escapeHtml(player.name)}</div>
                    <div class="leaderboard-subtitle">Answered ${player.correct_answers}/${player.total_questions} correctly</div>
                </div>
                <div class="leaderboard-score">${player.score}</div>
            `;
            leaderboardContainer.appendChild(item);
        });
    },

    startTimer() {
        let seconds = 15;
        const timerElement = document.querySelector('.timer-value');
        const timerContainer = document.querySelector('.timer');
        
        // Reset timer classes
        timerContainer.classList.remove('warning', 'danger');
        
        const interval = setInterval(() => {
            seconds--;
            timerElement.textContent = seconds;
            
            if (seconds <= 5) {
                timerContainer.classList.add('warning');
            }
            if (seconds <= 2) {
                timerContainer.classList.add('danger');
            }
            
            if (seconds === 0) {
                clearInterval(interval);
            }
        }, 1000);
    },

    updatePlayerList(players) {
        const playerList = document.querySelector('.player-list');
        playerList.innerHTML = '';
        
        players.forEach(player => {
            const isCurrentPlayer = player.id === this.playerId;
            const playerItem = document.createElement('div');
            playerItem.className = `player-item ${isCurrentPlayer ? 'active' : ''}`;
            playerItem.innerHTML = `
                <div class="player-avatar">${player.avatar}</div>
                <div class="player-info">
                    <div class="player-name">${escapeHtml(player.name)} ${isCurrentPlayer ? '(You)' : ''}</div>
                    <div class="player-score">${player.score} pts</div>
                </div>
            `;
            playerList.appendChild(playerItem);
        });
    }
};

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    app.goToLanding();
    app.setupCharacterCounter();
});
```

## Important Notes:

1. **CORS**: Make sure your backend FastAPI app has CORS enabled
2. **API Response Format**: Update the API response field names to match your actual backend
3. **WebSocket**: Optional - remove if not using real-time updates
4. **Character Counter**: Already integrated in the textarea input
5. **Error Handling**: Add proper error messages and retry logic as needed

## Required Backend Endpoints:

```
POST   /api/games                          # Create game
POST   /api/games/{game_id}/join          # Join game
GET    /api/games/{game_id}/question      # Get question
POST   /api/games/{game_id}/answer        # Submit answer
GET    /api/games/{game_id}/answers       # Get all answers
POST   /api/games/{game_id}/vote          # Submit vote
GET    /api/games/{game_id}/results       # Get results
WS     /ws/game/{game_id}                 # WebSocket
```
