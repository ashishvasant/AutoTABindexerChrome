chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === "GET_PAGE_CONTENT") {
        try {
          sendResponse({
            title: document.title,
            content: document.body.innerText.substring(0, 1000),
            metaDescription: document.querySelector('meta[name="description"]')?.content || ''
          });

        } catch (error) {
          console.error("Error getting page content:", error);
          sendResponse(null); // Indicate failure
        }
    }
  });
