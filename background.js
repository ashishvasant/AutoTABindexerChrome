class TabGroupOrganizer {
    constructor() {
      this.groupDescriptions = new Map();
      this.initialize();
      this.setupListeners();
    }
  
    async initialize() {
      const data = await chrome.storage.local.get(['groupDescriptions', 'tabData', 'aiInstructions']);
      this.groupDescriptions = new Map(Object.entries(data.groupDescriptions || {}));
      this.tabData = data.tabData || {};
      await this.initializeAI();
    }
  
    async initializeAI() {
      if (this.aiSession) return;
      try {
        this.aiSession = await ai.languageModel.create({
          temperature: 0.3,
          topK: 40
        });
        console.log('AI session initialized');
      } catch (error) {
        console.error('Error initializing AI:', error);
      }
    }
  
    async getPageContent(tab) {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: () => ({
            title: document.title,
            content: document.body.innerText.substring(0, 1000),
            metaDescription: document.querySelector('meta[name="description"]')?.content || ''
          })
        });
        return {
          ...result.result,
          url: tab.url
        };
      } catch (error) {
        console.error('Error getting page content:', error);
        return {
          title: tab.title,
          url: tab.url,
          content: '',
          metaDescription: ''
        };
      }
    }
  
    async step1_generatePageDescription(tab, userInstructions) {
      const pageContent = await this.getPageContent(tab);
      
      const prompt = `
      Analyze this webpage and generate a description and tags.
      ${userInstructions ? `User Instructions: ${userInstructions}\n` : ''}
  
      Page Information:
      Title: ${pageContent.title}
      URL: ${pageContent.url}
      Content Preview: ${pageContent.content}
      Meta Description: ${pageContent.metaDescription}
  
      Please provide output in the following JSON format:
      {
        "description": "A concise one-sentence description of the page",
        "tags": ["tag1", "tag2", "tag3"],
        "title": "page title"
      }`;
      console.log("First PROMPT:",prompt);
      let result;
      try {
        const response = await this.aiSession.prompt(prompt);
        console.log(response);
          // Attempt to parse the JSON response
        
        try {
          result = JSON.parse(response);
        } catch (jsonError) {
          console.warn('JSON parsing failed. Attempting to sanitize response...');
          
          // Sanitize response for common issues
          const sanitizedResponse = response
            .replace(/```json/g, '') // Remove ```json
            .replace(/```/g, '')     // Remove any remaining ```
            .trim();                 // Remove leading/trailing whitespace
  
          // Retry parsing
          result = JSON.parse(sanitizedResponse);
        }
        
  
              // Validate structure
        if (!result.description || !Array.isArray(result.tags) || !result.title) {
          throw new Error('Invalid JSON format');
        }
  
  
  
  
  
        // Save to storage if not already exists
        if (!this.tabData[pageContent.url]) {
          this.tabData[pageContent.url] = result;
          await chrome.storage.local.set({ tabData: this.tabData });
        }
        

        chrome.runtime.sendMessage({ 
            type: "UPDATE_TAB_DATA", 
            tabData: { [pageContent.url]: result } // Send only the new data
        });
        return result;
      } catch (error) {
        console.error('AI Error in step 1:', error);
        return null;
      }
    }
  
    async step2_determineTabGroup(tab, pageInfo, userInstructions) {
      const existingGroups = await chrome.tabGroups.query({});
      const { groupAiControl } = await chrome.storage.local.get(['groupAiControl']);
      const prompt = `
      Determine the appropriate tab group for this page ${userInstructions ? 'based on the user Instructions below.':''}
      ${userInstructions ? `User Instructions: ${userInstructions}\n` : ''}
  
      Page Information:
      ${JSON.stringify(pageInfo, null, 2)}
  
      Existing Groups:
 ${existingGroups.map(group => {
            const allowAiUpdates = !groupAiControl || groupAiControl[group.id] !== false;
            return `Group "${group.title}": ${allowAiUpdates ? (this.groupDescriptions.get(group.id.toString()) || 'No description') : '[AI updates disabled]'}`
        }).join('\n')}
      Create new group name if the tags do not match the existing groups.
      Please provide output in the following JSON format:
      {
        "suggestedGroup": "name of the group",
        "reason":"reason why this belongs to the group or reason new group was created",
        "groupDescription": "new description of group containing this tab",
        "autoGroup": boolean (based on user instructions, should this be automatically grouped?)
      }`;
      console.log("PROMPT:",prompt);
      try {
  
        const response = await this.aiSession.prompt(prompt);
        console.log("Response:",response);
                      // Sanitize response for common issues
        const sanitizedResponse = response
        .replace(/```json/g, '') // Remove ```json
        .replace(/```/g, '')     // Remove any remaining ```
        .trim();                 // Remove leading/trailing whitespace
  
        return JSON.parse(sanitizedResponse);
      } catch (error) {
        console.error('AI Error in step 2:', error);
        return null;
      }
    }
  
    async step3_updateUI(tabId, groupSuggestion) {
      // Update popup UI with suggestion
      await chrome.storage.local.set({
        [`suggestion_${tabId}`]: {
          tabId,
          groupName: groupSuggestion.suggestedGroup,
          description: groupSuggestion.groupDescription,
          autoGroup: groupSuggestion.autoGroup
        }
      });
            // Update index page after UI update
    chrome.runtime.sendMessage({ type: "UPDATE_TAB_DATA" }); 
    }
  
    async step4_autoGroup(tab, groupSuggestion) {
        if (!groupSuggestion.autoGroup) return;
      
        try {
            const { groupAiControl } = await chrome.storage.local.get(['groupAiControl']);
          const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId }); // crucial change!
          const existingGroup = existingGroups.find(
            group => group.title?.toLowerCase() === groupSuggestion.suggestedGroup.toLowerCase()
          );
      
          if (existingGroup) {


            const allowAiUpdates = !groupAiControl || groupAiControl[existingGroup.id] !== false;
            if (allowAiUpdates) {
                this.groupDescriptions.set(existingGroup.id.toString(), groupSuggestion.groupDescription);
                await chrome.storage.local.set({ 
                    groupDescriptions: Object.fromEntries(this.groupDescriptions) 
                });
            }


            await chrome.tabs.group({
              tabIds: tab.id,
              groupId: existingGroup.id
            });
          } else {
            const groupId = await chrome.tabs.group({
              tabIds: tab.id
            });
            await chrome.tabGroups.update(groupId, {
              title: groupSuggestion.suggestedGroup
            });
            this.groupDescriptions.set(groupId.toString(), groupSuggestion.groupDescription);
            await chrome.storage.local.set({ groupDescriptions: Object.fromEntries(this.groupDescriptions) });
            this.groupDescriptions.set(groupId.toString(), groupSuggestion.groupDescription);
            await chrome.storage.local.set({ 
                groupDescriptions: Object.fromEntries(this.groupDescriptions),
                groupAiControl: { 
                    ...groupAiControl, 
                    [groupId]: true // Enable AI updates by default for new groups
                }
            });
        
        
        }
        } catch (error) {
          console.error('Error in auto-grouping:', error);
        }
      }
  
    async processNewTab(tab) {
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
  
      // Get user instructions
      const { aiInstructions } = await chrome.storage.local.get('aiInstructions');
      console.log(aiInstructions);
      // Step 1: Generate page description and tags
      const pageInfo = await this.step1_generatePageDescription(tab, aiInstructions);
      if (!pageInfo) return;
  
      // Step 2: Determine tab group
      const groupSuggestion = await this.step2_determineTabGroup(tab, pageInfo, aiInstructions);
      if (!groupSuggestion) return;
  
      // Step 3: Update UI
      await this.step3_updateUI(tab.id, groupSuggestion);
  
      // Step 4: Auto-group if specified
      await this.step4_autoGroup(tab, groupSuggestion);

          // Update index page after processing
    chrome.runtime.sendMessage({ type: "UPDATE_TAB_DATA" });
    }
    
    setupListeners() {
      // Listen for tab updates
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
          this.processNewTab(tab);
        }
      });
  
      // Other listeners as needed...
    }
  }
  
  let indexTabId = null;
// Event listener for updating index.html
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "UPDATE_TAB_DATA") {
        // Find the index.html tab and send it a message to update its data.
        chrome.tabs.query({ url: chrome.runtime.getURL("index.html") }, (tabs) => {
            if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "UPDATE_TAB_DATA" });
            }
        });
    }
});
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "OPEN_INDEX_PAGE") {
        //openIndexPage(); 
      chrome.tabs.query({}, (tabs) => {
        const existingIndexTab = tabs.find((tab) => tab.url && tab.url.includes("index.html"));
  
        if (existingIndexTab) {
          indexTabId = existingIndexTab.id;
          chrome.tabs.update(indexTabId, { active: true });
        } else {
          chrome.tabs.create(
            {
              url: chrome.runtime.getURL("index.html"),
              pinned: true,
              active: true,
            },
            (tab) => {
              indexTabId = tab.id;
            }
          );
        }
      });
    }
  });
  //let indexTabId = null;

    async function openIndexPage() {
    const tabs = await chrome.tabs.query({});
    const existingIndexTab = tabs.find(tab => tab.url && tab.url.includes("index.html"));

    if (existingIndexTab) {
        indexTabId = existingIndexTab.id;
        chrome.tabs.update(indexTabId, { active: true });
    } else {
        chrome.tabs.create({
        url: chrome.runtime.getURL("index.html"),
        active: true // Open in the current window
        }, (tab) => {
        indexTabId = tab.id;
        });
    }
    }
    chrome.runtime.onInstalled.addListener(async (details) => {
        if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
          // Open the index page on first install.
          //openIndexPage();
      
        }
      });
chrome.tabs.onCreated.addListener(updateTabData);
chrome.tabs.onRemoved.addListener(updateTabData);
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.type === "OPEN_INDEX_PAGE") {
//       openIndexPage();
//     }
//     // ... (other message listeners)
//   });
function updateTabData() {
    console.log("UPDATE TAB DATA");
    chrome.runtime.sendMessage({ type: "UPDATE_TAB_DATA" });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "UPDATE_TAB_DATA") {
        chrome.tabs.query({ url: chrome.runtime.getURL("index.html") }, (tabs) => {
            if (tabs && tabs.length > 0) {
                // Send the received tabData to the index page
                chrome.tabs.sendMessage(tabs[0].id, message); // Send the whole message
            }
        });
    }
});

  // Initialize the organizer
  const tabGroupOrganizer = new TabGroupOrganizer();
