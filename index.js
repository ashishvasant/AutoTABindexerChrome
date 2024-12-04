// index.js
document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("container");
    const tabComments = new Map();
    let isUpdating = false;
    let tabData = {}; // Initialize tabData at the top level

    // Debounce function to prevent rapid updates
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Fetch AI description for a tab
    async function getAiDescription(url) {
        try {
            // First check tabData for the description
            if (tabData[url] && tabData[url].description) {
                return tabData[url].description;
            }
            
            // If not in tabData, try to get it from the background
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "GET_AI_DESCRIPTION", url: url }, resolve);
            });
            return response?.description || null;
        } catch (error) {
            console.error("Error fetching AI description:", error);
            return null;
        }
    }

    // Update tab description in the UI
    function updateTabDescription(tabId, url) {
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (!tabElement) return;

        const textarea = tabElement.querySelector('.tab-comment');
        if (!textarea) return;

        // Get the description from tabData if available
        const description = tabData[url]?.description || '';
        
        // Only update if the textarea is not currently being edited
        if (document.activeElement !== textarea) {
            textarea.value = description;
        }
    }

    // Create tab element
    async function createTabElement(tab, content) {
        const tabDiv = document.createElement("div");
        tabDiv.className = "tab-item";
        tabDiv.draggable = true;
        tabDiv.dataset.tabId = tab.id;

        // Handle drag events
        tabDiv.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", tab.id.toString());
            e.dataTransfer.effectAllowed = "move";
            tabDiv.classList.add("dragging");
        });

        tabDiv.addEventListener("dragend", () => {
            tabDiv.classList.remove("dragging");
        });

        // Create title section
        const titleDiv = document.createElement("div");
        titleDiv.className = "tab-title";
        
        const favicon = document.createElement("img");
        favicon.src = tab.favIconUrl || "default-favicon.png";
        favicon.className = "tab-favicon";
        favicon.width = 16;
        favicon.height = 16;
        titleDiv.appendChild(favicon);

        const link = document.createElement("a");
        link.href = "#";
        link.textContent = tab.title || "Untitled Tab";
        link.onclick = (e) => {
            e.preventDefault();
            chrome.tabs.update(tab.id, { active: true });
        };
        titleDiv.appendChild(link);
        tabDiv.appendChild(titleDiv);

        // Create description section
        const descriptionDiv = document.createElement("div");
        descriptionDiv.className = "tab-description";
        
        const aiDescription = await getAiDescription(tab.url);
        const storedComment = tabComments.get(`tab-${tab.id}`);
        
        const descriptionTextarea = document.createElement("textarea");
        descriptionTextarea.className = "tab-comment";
        descriptionTextarea.placeholder = "Add tab description here...";
        descriptionTextarea.value = storedComment || aiDescription || "";

        // Handle description updates
        const updateDescription = debounce(async (value) => {
            tabComments.set(`tab-${tab.id}`, value);
            chrome.runtime.sendMessage({
                type: "UPDATE_AI_DESCRIPTION",
                url: tab.url,
                description: value
            });
        }, 500);

        descriptionTextarea.addEventListener("input", () => {
            updateDescription(descriptionTextarea.value);
        });

        descriptionDiv.appendChild(descriptionTextarea);
        tabDiv.appendChild(descriptionDiv);

        return tabDiv;
    }

    // Create group element
    function createGroupElement(group, tabs) {
        const groupDiv = document.createElement("div");
        groupDiv.className = "tab-group";
        const groupId = group ? group.id : -1;
        groupDiv.dataset.groupId = groupId;


            // Apply group color
        // Define color mapping for tab groups
        const TAB_GROUP_COLOR_MAP = {
            "grey": "#d3d3d3",
            "blue": "#add8e6",
            "red": "#ffcccb",
            "yellow": "#ffffe0",
            "green": "#90ee90",
            "pink": "#ffb6c1",
            "purple": "#dda0dd",
            "cyan": "#e0ffff",
            "orange": "#ffa07a",
        };



        
        // Create group header
        const header = document.createElement("div");
        header.className = "tab-group-header";
        
        const titleSpan = document.createElement("span");
        titleSpan.textContent = group ? (group.title || `Group ${group.id}`) : "Ungrouped Tabs";
        titleSpan.contentEditable = true;
        

            // Enhance font styling and size
        titleSpan.style.fontSize = "16px";
        titleSpan.style.fontWeight = "bold";
        titleSpan.style.color = "#000000"; // White text for better contrast
        titleSpan.style.padding = "5px 10px";
        titleSpan.style.borderRadius = "4px";
        
        
        titleSpan.addEventListener("blur", async () => {
            if (group) {
                await chrome.tabGroups.update(group.id, { title: titleSpan.textContent });
            }
        });
        header.appendChild(titleSpan);




        const descriptionContainer = document.createElement("div");
        descriptionContainer.className = "group-description-container";
        


        const descriptionTextarea = document.createElement("textarea");
        descriptionTextarea.className = "group-description";
        descriptionTextarea.placeholder = "Add group description...";
        

        // Apply group color
        if (group && group.color) {
            const groupColor = TAB_GROUP_COLOR_MAP[group.color] || "#f0f0f0"; // Fallback to default
            groupDiv.style.backgroundColor = groupColor;
            descriptionTextarea.style.backgroundColor = groupColor;
        } else {
            groupDiv.style.backgroundColor = "#f0f0f0"; // Default for ungrouped tabs
            descriptionTextarea.style.backgroundColor = "#f0f0f0";
        }




        // Get the stored description if it exists
        if (group) {
            chrome.storage.local.get(['groupDescriptions'], (data) => {
                const descriptions = data.groupDescriptions || {};
                descriptionTextarea.value = descriptions[group.id] || '';
            });
        }
    
        const aiControlContainer = document.createElement("div");
        aiControlContainer.className = "ai-control";
        
        const aiCheckbox = document.createElement("input");
        aiCheckbox.type = "checkbox";
        aiCheckbox.id = `ai-control-${groupId}`;
        aiCheckbox.className = "ai-checkbox";
    
        // Get stored AI control preference
        if (group) {
            chrome.storage.local.get(['groupAiControl'], (data) => {
                const aiControls = data.groupAiControl || {};
                aiCheckbox.checked = aiControls[group.id] !== false; // Default to true
            });
        }
    
        const aiLabel = document.createElement("label");
        aiLabel.htmlFor = `ai-control-${groupId}`;
        aiLabel.textContent = "Allow AI updates to the Group Description";
        
        aiControlContainer.appendChild(aiCheckbox);
        aiControlContainer.appendChild(aiLabel);
    
        // Handle description updates
        const updateDescription = debounce(async (value) => {
            if (group) {
                const data = await chrome.storage.local.get(['groupDescriptions']);
                const descriptions = data.groupDescriptions || {};
                descriptions[group.id] = value;
                await chrome.storage.local.set({ groupDescriptions: descriptions });
            }
        }, 500);
    
        descriptionTextarea.addEventListener("input", () => {
            updateDescription(descriptionTextarea.value);
        });
    
        // Handle AI control updates
        aiCheckbox.addEventListener("change", async () => {
            if (group) {
                const data = await chrome.storage.local.get(['groupAiControl']);
                const aiControls = data.groupAiControl || {};
                aiControls[group.id] = aiCheckbox.checked;
                await chrome.storage.local.set({ groupAiControl: aiControls });
            }
        });
    
        descriptionContainer.appendChild(descriptionTextarea);
        descriptionContainer.appendChild(aiControlContainer);
        header.appendChild(descriptionContainer);





        // Create group content
        const content = document.createElement("div");
        content.className = "tab-group-content";
        content.dataset.groupId = groupId;

        // Handle drag and drop
        content.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            content.classList.add("drag-over");
        });

        content.addEventListener("dragleave", () => {
            content.classList.remove("drag-over");
        });

        content.addEventListener("drop", async (e) => {
            e.preventDefault();
            content.classList.remove("drag-over");
            
            const tabId = parseInt(e.dataTransfer.getData("text/plain"), 10);
            const newGroupId = parseInt(content.dataset.groupId, 10);

            try {
                if (newGroupId === -1) {
                    await chrome.tabs.ungroup(tabId);
                } else {
                    await chrome.tabs.group({ tabIds: tabId, groupId: newGroupId });
                }
                await fetchTabsAndGroups();
            } catch (error) {
                console.error("Error during drag-and-drop:", error);
            }
        });

        // Add tabs to group
        Promise.all(tabs.map(tab => createTabElement(tab, content)))
            .then(tabElements => {
                tabElements.forEach(tabElement => content.appendChild(tabElement));
            });

        groupDiv.appendChild(header);
        groupDiv.appendChild(content);
        return groupDiv;
    }

    // Main function to fetch and display tabs
    async function fetchTabsAndGroups() {
        if (isUpdating) return;
        isUpdating = true;

        try {
            // First, get the latest tabData from storage
            const data = await chrome.storage.local.get(['tabData']);
            if (data.tabData) {
                tabData = data.tabData;
            }

            const currentWindow = await chrome.windows.getCurrent();
            const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
            const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });

            // Group tabs by their group ID
            const groupedTabs = tabs.reduce((acc, tab) => {
                const groupId = tab.groupId || -1;
                acc[groupId] = acc[groupId] || [];
                acc[groupId].push(tab);
                return acc;
            }, {});

            // Clear container
            container.innerHTML = "";

            // Add grouped tabs
            for (const group of groups) {
                container.appendChild(createGroupElement(group, groupedTabs[group.id] || []));
                delete groupedTabs[group.id];
            }

            // Add ungrouped tabs
            if (groupedTabs[-1]?.length > 0) {
                container.appendChild(createGroupElement(null, groupedTabs[-1]));
            }

            // Update all tab descriptions
            tabs.forEach(tab => {
                updateTabDescription(tab.id, tab.url);
            });
        } catch (error) {
            console.error("Error fetching tabs and groups:", error);
        } finally {
            isUpdating = false;
        }
    }

    // Set up event listeners for tab data updates
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "UPDATE_TAB_DATA") {
            if (message.tabData) {
                // Update only the specific tab data that changed
                tabData = { ...tabData, ...message.tabData };
                
                // Get all tabs and update their descriptions
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        if (message.tabData[tab.url]) {
                            updateTabDescription(tab.id, tab.url);
                        }
                    });
                });
            } else {
                // If no specific tabData provided, refresh everything
                fetchTabsAndGroups();
            }
        }
    });
     // CSS styles injected directly into the page
     const style = document.createElement('style');
     style.textContent = `
/* Container to take full screen */
/* Ensure the container takes up the entire screen */
/* Ensure the container takes up the entire screen */
html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: #f9fafb;
}

#container {
    height: 100%;
    width: 100%;
    overflow-y: auto; /* Make the container vertically scrollable */
    padding: 15px; /* Add some padding for better spacing */
    box-sizing: border-box;
}

/* Adjust tab-item styling to expand for content */
.tab-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 15px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #ffffff;
    transition: transform 0.2s, box-shadow 0.2s;
    flex: 1 1 100%;
    max-width: 100%;
    box-sizing: border-box;
    align-items: stretch; /* Stretch children horizontally */
    margin-bottom: 15px;
}

/* Tab title aligned horizontally with description taking most space */
.tab-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: #374151;
    width: 100%;
}

.tab-title img {
    flex-shrink: 0; /* Prevent favicon from shrinking */
}

.tab-title a {
    color: #2563eb;
    text-decoration: none;
    flex-grow: 1; /* Allow link to take extra space */
    word-wrap: break-word; /* Wrap long URLs */
}

.tab-title a:hover {
    text-decoration: underline;
}

/* Description input fields expand to take up more space */
.tab-description, .tab-comment {
    width: 100%; /* Full width */
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 10px;
    resize: none; /* Prevent manual resizing */
    box-sizing: border-box;
    font-size: 14px;
    line-height: 1.5;
    overflow: hidden;
    height: auto; /* Allow height to adjust dynamically */
    min-height: 50px; /* Set a minimum height */
}

/* Ensure group content flows properly */
.tab-group-content {
    display: flex;
    flex-direction: column; /* Stack tabs vertically */
    gap: 15px; /* Space between tabs */
    padding: 15px;
    background: white;
    box-sizing: border-box;
    width: 100%;
}

/* Responsive adjustments for smaller screens */
@media (max-width: 768px) {
    .tab-item {
        flex: 1 1 100%; /* Full width for smaller screens */
    }
}
    /* Group description container styling */
.group-description-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%; /* Ensure the container takes up the full width */
    padding-top: 10px; /* Add spacing below the group header */
    box-sizing: border-box;
}

/* Group description textarea styling */
.group-description {
    width: 100%; /* Full width */
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 10px;
    resize: none; /* Prevent manual resizing */
    box-sizing: border-box;
    font-size: 14px;
    line-height: 1.5;
    overflow: hidden; /* Prevent scrollbars */
    height: auto; /* Allow height to adjust dynamically */
    min-height: 50px; /* Set a minimum height */
}

/* AI control container styling */
.ai-control {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 5px; /* Add spacing between the checkbox and description */
}

.ai-control input[type="checkbox"] {
    margin: 0;
}

.ai-control label {
    font-size: 14px;
    color: #374151;
    cursor: pointer;
}



 
     `;
// Make the container scrollable
//const container = document.getElementById("container");
container.style.overflowY = "auto";

// Add auto-resize functionality to textareas dynamically
function autoResizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
}

// Apply auto-resize to all textareas dynamically
document.addEventListener("input", (event) => {
    if (event.target.tagName === "TEXTAREA") {
        autoResizeTextarea(event.target);
    }
});

// Auto-resize all existing textareas on page load
document.querySelectorAll("textarea").forEach(autoResizeTextarea);

// Apply auto-resize on load for existing content
document.querySelectorAll("textarea").forEach(autoResizeTextarea);

     document.head.appendChild(style);
    // Initial fetch
    fetchTabsAndGroups();
});
document.addEventListener("input", (event) => {
    if (event.target.classList.contains("group-description")) {
        autoResizeTextarea(event.target);
    }
});
