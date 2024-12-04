
async function updateUI() {
    const tab = await getCurrentTab();
    if (!tab) return;
  
    const data = await chrome.storage.local.get(`suggestion_${tab.id}`);
    const suggestion = data[`suggestion_${tab.id}`];
  
    if (suggestion) {
      document.getElementById('groupNameInput').value = 
        `Move to "${suggestion.groupName}"`;
      document.getElementById('groupDescription').textContent = 
        suggestion.description;
    }
  }
  
  document.addEventListener('DOMContentLoaded', () => {
    updateUI();
  
    const instructionsInput = document.getElementById('aiInstructions');
    instructionsInput.addEventListener('change', async () => {
      await chrome.storage.local.set({ aiInstructions: instructionsInput.value });
      updateUI(); // Update the UI after saving new instructions
    });
  
  
    chrome.storage.local.get('aiInstructions', (data) => {
      instructionsInput.value = data.aiInstructions || "";
    });
  
  });

  document.addEventListener("DOMContentLoaded", () => {
    const openIndexButton = document.getElementById("open-index");
  
    openIndexButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_INDEX_PAGE" });
    });
    document.getElementById('open-index').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: "OPEN_INDEX_PAGE" });
      });
  });
  
