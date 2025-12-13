document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('action-btn');
    const greeting = document.getElementById('greeting');
    
    button.addEventListener('click', () => {
        // Simple toggle effect
        if (greeting.textContent === "Hello, World.") {
            greeting.textContent = "Hello, Developer.";
            greeting.style.background = 'linear-gradient(135deg, #3b82f6 0%, #10b981 100%)';
            greeting.style.webkitBackgroundClip = 'text';
            greeting.style.webkitTextFillColor = 'transparent';
        } else {
            greeting.textContent = "Hello, World.";
            greeting.style.background = 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)';
            greeting.style.webkitBackgroundClip = 'text';
            greeting.style.webkitTextFillColor = 'transparent';
        }
        
        console.log("Interaction triggered!");
    });
});
