// ===================================
// MESSAGE BOARD APPLICATION
// ===================================

// Configuration
const CONFIG = {
  API_URL: 'https://7hfrgj6w5i.execute-api.eu-central-1.amazonaws.com/prod/messages',
  STORAGE_KEY: 'messageBoard_messages',
  MAX_MESSAGE_LENGTH: 500,
  ANIMATION_DELAY: 100
};

// State
let messages = [];
let selectedAvatar = 'anonymous'; // Default avatar

// ===================================
// INITIALIZATION
// ===================================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

async function initializeApp() {
  // Load messages from AWS API
  await loadMessages();

  // Setup event listeners
  setupEventListeners();
  setupAvatarSelection();
  setupDashboard();

  // Render initial state
  renderMessages();
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
  const messageInput = document.getElementById('messageInput');
  const submitBtn = document.getElementById('submitBtn');

  // Character counter
  messageInput.addEventListener('input', updateCharCounter);

  // Submit message
  submitBtn.addEventListener('click', handleSubmit);

  // Submit on Ctrl/Cmd + Enter
  messageInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit();
    }
  });
}

function setupAvatarSelection() {
  const options = document.querySelectorAll('.avatar-option');

  options.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove selected class from all
      options.forEach(opt => opt.classList.remove('selected'));
      // Add to clicked
      btn.classList.add('selected');
      // Update state
      selectedAvatar = btn.dataset.avatar;
    });
  });
}

// ===================================
// DASHBOARD
// ===================================

let activityChart = null;

function setupDashboard() {
  const modal = document.getElementById('dashboardModal');
  const openBtn = document.getElementById('statsBtn');
  const closeBtn = document.getElementById('closeStats');

  openBtn.addEventListener('click', () => {
    updateDashboard();
    modal.style.display = 'flex';
  });

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
}

function updateDashboard() {
  // 1. Basic Stats
  const totalMessages = messages.length;
  document.getElementById('totalMessages').textContent = totalMessages;

  let wordCount = 0;
  let reactionCount = 0;

  // Buckets for chart (Hours of day)
  const hoursDistribution = new Array(24).fill(0);

  messages.forEach(msg => {
    // Words
    if (msg.content) {
      wordCount += msg.content.trim().split(/\s+/).length;
    }

    // Reactions
    if (msg.reactions) {
      Object.values(msg.reactions).forEach(count => {
        reactionCount += parseInt(count) || 0;
      });
    }

    // Chart Data
    if (msg.timestamp) {
      const date = new Date(msg.timestamp);
      const hour = date.getHours();
      hoursDistribution[hour]++;
    }
  });

  document.getElementById('totalWords').textContent = wordCount;
  document.getElementById('totalReactions').textContent = reactionCount;

  // 2. Render Chart
  renderChart(hoursDistribution);
}

function renderChart(data) {
  const ctx = document.getElementById('activityChart').getContext('2d');

  if (activityChart) {
    activityChart.destroy();
  }

  activityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => `${i} Uhr`),
      datasets: [{
        label: 'Nachrichten pro Stunde',
        data: data,
        backgroundColor: 'rgba(100, 108, 255, 0.5)',
        borderColor: '#646cff',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#aaa' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#aaa' }
        }
      },
      plugins: {
        legend: { labels: { color: '#fff' } }
      }
    }
  });
}

// ===================================
// CHARACTER COUNTER
// ===================================

function updateCharCounter() {
  const messageInput = document.getElementById('messageInput');
  const charCount = document.getElementById('charCount');
  const counter = charCount.parentElement;

  const length = messageInput.value.length;
  charCount.textContent = length;

  // Add warning class when approaching limit
  if (length > CONFIG.MAX_MESSAGE_LENGTH * 0.9) {
    counter.classList.add('warning');
  } else {
    counter.classList.remove('warning');
  }
}

// ===================================
// MESSAGE SUBMISSION
// ===================================

async function handleSubmit() {
  const messageInput = document.getElementById('messageInput');
  const content = messageInput.value.trim();

  // Validate input
  if (!content) {
    showError('Bitte gib eine Nachricht ein.');
    return;
  }

  if (content.length > CONFIG.MAX_MESSAGE_LENGTH) {
    showError(`Die Nachricht darf maximal ${CONFIG.MAX_MESSAGE_LENGTH} Zeichen lang sein.`);
    return;
  }

  // Create message data (server generates ID and timestamp)
  const messageData = {
    content: content,
    avatar: selectedAvatar
  };

  try {
    // Save to AWS API
    const savedMessage = await saveMessage(messageData);

    // Add to local array
    messages.unshift(savedMessage);

    // Clear input
    messageInput.value = '';
    updateCharCounter();

    // Re-render messages
    renderMessages();

    // Show success feedback
    showSuccess();
  } catch (error) {
    // Error already handled in saveMessage
  }
}

function createMessage(content) {
  return {
    id: generateId(),
    content: content,
    timestamp: Date.now(),
    createdAt: new Date().toISOString()
  };
}

function generateId() {
  // Simple UUID-like ID generator
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ===================================
// STORAGE OPERATIONS
// ===================================

async function loadMessages() {
  try {
    const response = await fetch(CONFIG.API_URL);
    if (!response.ok) throw new Error('Failed to load messages');
    messages = await response.json();
  } catch (error) {
    console.error('Error loading messages:', error);
    showError('Fehler beim Laden der Nachrichten.');
  }
}

async function saveMessage(messageData) {
  try {
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageData)
    });

    if (!response.ok) throw new Error('Failed to save message');

    return await response.json();
  } catch (error) {
    console.error('Error saving message:', error);
    showError('Fehler beim Speichern der Nachricht.');
    throw error;
  }
}

// ===================================
// RENDERING
// ===================================

function renderMessages() {
  const container = document.getElementById('messagesContainer');
  const emptyState = document.getElementById('emptyState');

  // Show/hide empty state
  if (messages.length === 0) {
    emptyState.style.display = 'block';
    container.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';

  // Clear container
  container.innerHTML = '';

  // Render each message
  messages.forEach((message, index) => {
    const messageCard = createMessageCard(message, index);
    container.appendChild(messageCard);
  });
}

function createMessageCard(message, index) {
  const card = document.createElement('div');
  card.className = 'message-card';
  card.style.animationDelay = `${index * CONFIG.ANIMATION_DELAY}ms`;

  // Message content
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = message.content;

  // Message metadata
  const meta = document.createElement('div');
  meta.className = 'message-meta';

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = formatTimestamp(message.timestamp);

  const id = document.createElement('div');
  id.className = 'message-id';
  // Use messageId from API or fallback to id (for safety)
  const displayId = message.messageId || message.id || 'unknown';
  id.textContent = displayId.substring(0, 12) + '...';
  id.title = displayId;

  meta.appendChild(time);
  meta.appendChild(id);



  // Reaction Section
  const reactionsDiv = document.createElement('div');
  reactionsDiv.className = 'reactions-container';

  // Available reactions
  const reactionTypes = ['👍', '❤️', '🔥', '🎉'];

  reactionTypes.forEach(type => {
    const btn = document.createElement('button');
    btn.className = 'reaction-btn';
    // Get count safely
    const count = (message.reactions && message.reactions[type]) || 0;

    btn.innerHTML = `<span>${type}</span> <span>${count || ''}</span>`;

    // Add click handler
    btn.onclick = () => reactToMessage(message, type, btn);

    reactionsDiv.appendChild(btn);
  });

  // Assemble card
  // Add avatar icon before content? Or structure differently?
  // Let's modify structure slightly for avatar

  const header = document.createElement('div');
  header.className = 'message-header';

  const avatarIcon = document.createElement('div');
  avatarIcon.className = 'message-avatar-icon';
  // Simple mapping for demo
  const avatars = {
    'anonymous': '👤', 'ninja': '🥷', 'cat': '🐱',
    'alien': '👽', 'robot': '🤖', 'unicorn': '🦄'
  };
  avatarIcon.textContent = avatars[message.avatar] || '👤';

  // Create a wrapper for content that sits next to avatar
  const contentWrapper = document.createElement('div');
  contentWrapper.style.flex = '1';
  contentWrapper.appendChild(content);
  contentWrapper.appendChild(meta);
  contentWrapper.appendChild(reactionsDiv);

  header.appendChild(avatarIcon);
  header.appendChild(contentWrapper);

  card.appendChild(header);

  return card;
}

async function reactToMessage(message, reaction, btn) {
  // Optimistic UI Update
  const countSpan = btn.children[1];
  let currentCount = parseInt(countSpan.textContent) || 0;
  countSpan.textContent = currentCount + 1;
  btn.classList.add('active');

  try {
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: message.messageId || message.id,
        timestamp: message.timestamp,
        reaction: reaction
      })
    });

    if (!response.ok) throw new Error('Reaction failed');

  } catch (error) {
    console.error('Reaction error:', error);
    // Revert UI
    countSpan.textContent = currentCount;
    btn.classList.remove('active');
    showError('Konnte nicht reagieren.');
  }
}

// ===================================
// UTILITIES
// ===================================

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Relative time
  if (diffMins < 1) return 'Gerade eben';
  if (diffMins < 60) return `vor ${diffMins} Min.`;
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;

  // Absolute time
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function showSuccess() {
  const submitBtn = document.getElementById('submitBtn');
  const originalText = submitBtn.innerHTML;

  // Show success state
  submitBtn.innerHTML = '<span>✅ Gesendet!</span>';
  submitBtn.disabled = true;

  // Reset after 2 seconds
  setTimeout(() => {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }, 2000);
}

// ===================================
// AWS MIGRATION PREPARATION
// ===================================

/*
  When migrating to AWS backend, replace the following functions:
  
  1. loadMessages() - Replace with API GET request to API Gateway
  2. saveMessages() - Replace with API POST request to API Gateway
  
  Example AWS integration:
  
  async function loadMessages() {
    try {
      const response = await fetch('YOUR_API_GATEWAY_URL/messages');
      messages = await response.json();
    } catch (error) {
      console.error('Error loading messages:', error);
      showError('Fehler beim Laden der Nachrichten.');
    }
  }
  
  async function saveMessage(message) {
    try {
      await fetch('YOUR_API_GATEWAY_URL/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
    } catch (error) {
      console.error('Error saving message:', error);
      showError('Fehler beim Speichern der Nachricht.');
    }
  }
*/
