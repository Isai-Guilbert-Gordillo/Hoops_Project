// public/toast.js
function showToast(message, type = 'success') {
    // Inject styles if they don't exist
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.innerHTML = `
            .toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .toast {
                background-color: #141419;
                color: #ffffff;
                font-family: 'Outfit', sans-serif;
                padding: 15px 25px;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                opacity: 0;
                transform: translateY(-20px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                min-width: 250px;
                text-align: center;
            }
            .toast.show {
                opacity: 1;
                transform: translateY(0);
            }
            .toast.success {
                border-left: 4px solid #00f0ff;
                box-shadow: 0 0 10px rgba(0, 240, 255, 0.2);
            }
            .toast.error {
                border-left: 4px solid #ff5722;
                box-shadow: 0 0 10px rgba(255, 87, 34, 0.2);
            }
        `;
        document.head.appendChild(style);
    }

    // Create container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerText = message;

    // Append and show
    container.appendChild(toast);
    
    // Trigger reflow to restart animation
    toast.offsetHeight; 
    toast.classList.add('show');

    // Remove after 3.5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 3500);
}
