// ======================================================
// TEAMMATE CARDS TOGGLE
// ======================================================
let TEAMMATE_CARDS_VISIBLE = true;

const toggleBtn = document.getElementById("toggle-reveal-btn");
if (toggleBtn) {
    toggleBtn.onclick = () => {
        TEAMMATE_CARDS_VISIBLE = !TEAMMATE_CARDS_VISIBLE;
        const list = document.getElementById("teammate-cards-list");
        const btn = document.getElementById("toggle-reveal-btn");

        if (TEAMMATE_CARDS_VISIBLE) {
            list.style.display = "flex";
            btn.textContent = "🙈 Hide Partner";
            btn.classList.remove("hidden-state");
        } else {
            list.style.display = "none";
            btn.textContent = "👁️ Show Partner";
            btn.classList.add("hidden-state");
        }

        Sound.bid();
        vibrate(30);
    };
}

// Show toggle when teammate cards visible
socket.on("teammateRevealed", data => {
    const btn = document.getElementById("toggle-reveal-btn");
    if (btn) {
        if (data.revealed) {
            btn.classList.remove("hidden");
            TEAMMATE_CARDS_VISIBLE = true;
            btn.textContent = "🙈 Hide Partner";
            btn.classList.remove("hidden-state");
            const list = document.getElementById("teammate-cards-list");
            if (list) list.style.display = "flex";
        } else {
            btn.classList.add("hidden");
        }
    }
});