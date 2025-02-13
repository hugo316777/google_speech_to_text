// 初始化全局變量
let isConnected = false;
let ws = null;  // WebSocket 實例

// 頁面加載完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    // 獲取按鈕元素
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    // 添加按鈕事件監聽
    startBtn.onclick = startListening;
    stopBtn.onclick = stopListening;
    
    updateStatus('準備就緒');
    
    // 添加提交按鈕事件監聽

    const inputField = document.getElementById('claude-input');
    const claudeOutput = document.getElementById('claude-output');
    
    // 添加 Font Awesome CDN
    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
    document.head.appendChild(fontAwesome);
    
    // 添加自定義樣式表
    const customStyles = document.createElement('link');
    customStyles.rel = 'stylesheet';
    customStyles.href = '/styles.css';  // 確保路徑正確
    document.head.appendChild(customStyles);
    
    // 創建 tooltip 元素
    const tooltip = document.createElement('div');
    tooltip.className = 'selection-tooltip';
    tooltip.textContent = '發送到輸入框';
    document.body.appendChild(tooltip);

    // 監聽文字選擇事件
    claudeOutput.addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText) {
            // 計算 tooltip 位置
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // 設置 tooltip 位置
            tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2)}px`;
            tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10 + window.scrollY}px`;
            tooltip.style.display = 'block';

            // 點擊 tooltip 時將選中文字發送到輸入框
            tooltip.onclick = () => {
                // 檢查輸入框是否已有內容
                if (inputField.value.trim()) {
                    inputField.value = inputField.value.trim() + '，' + selectedText;
                } else {
                    inputField.value = selectedText;
                }
                tooltip.style.display = 'none';
                inputField.focus();
            };
        }
    });

    // 點擊其他地方時隱藏 tooltip
    document.addEventListener('mousedown', (e) => {
        if (!tooltip.contains(e.target)) {
            tooltip.style.display = 'none';
        }
    });

    // 滾動時隱藏 tooltip
    document.addEventListener('scroll', () => {
        tooltip.style.display = 'none';
    });
});

// 開始聆聽
function startListening() {
    if (isConnected) return;
    
    document.getElementById('start-btn').disabled = true;
    document.getElementById('stop-btn').disabled = false;
    updateStatus('正在連接到後端服務...', '#ffa500');  // 橙色
    connectToBackend();
}

// 停止聆聽
function stopListening() {
    if (!isConnected) return;
    
    document.getElementById('start-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    
    if (ws) {
        ws.close();
        ws = null;
    }
    updateStatus('已停止聆聽', '#2196F3');  // 藍色
}

// 連接到後端服務
function connectToBackend() {
    ws = new WebSocket('ws://localhost:8081');
    
    ws.onopen = () => {
        console.log('已連接到後端服務');
        isConnected = true;
        updateStatus('已連接，正在聆聽...', 'green');
    };
    
    ws.onclose = () => {
        console.log('與後端服務斷開連接');
        isConnected = false;
        updateStatus('已斷開連接', 'gray');
        ws = null;
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript') {
                if (data.isFinal) {
                    // 最終結果
                    appendTranscript(data.text);
                } else {
                    // 中間結果
                    updateInterimResult(data.text);
                }
            }
        } catch (error) {
            console.error('解析消息時出錯:', error);
        }
    };
}

// 更新狀態顯示
function updateStatus(message, color = '#000000') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.style.color = color;
}

// 顯示轉錄結果
function appendTranscript(text) {
    const output = document.getElementById('output');
    const time = new Date().toLocaleTimeString();
    
    // 移除之前的中間結果（如果有）
    const interimElement = output.querySelector('.interim');
    if (interimElement) {
        interimElement.remove();
    }
    
    const p = document.createElement('p');
    p.className = 'final';
    p.dataset.isEditing = 'false';  // 初始化編輯狀態

    p.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px;
        margin: 5px 0;
        cursor: pointer;  // 添加指針樣式
    `;

    // 添加雙擊事件
    p.addEventListener('dblclick', (e) => {
        if (p.dataset.isEditing === 'true') {
            return;  // 如果正在編輯中，直接返回
        }
        
        // 防止事件冒泡，避免觸發其他點擊事件
        e.stopPropagation();
        p.dataset.isEditing = 'true';  // 設置編輯狀態

        // 調用 enableEditing
        enableEditing(textContainer, textSpan, editIcon);
    });

      // 添加編輯圖標
      const editIcon = document.createElement('i');
      editIcon.className = 'fas fa-edit edit-icon';
      editIcon.style.cssText = `
          cursor: pointer;
          color: #666;
          transition: color 0.3s ease;
          font-size: 16px;
      `;
      

    // 修改編輯圖標點擊事件
    editIcon.onclick = () => {
        if (p.dataset.isEditing === 'true') {
            return;  // 如果正在編輯中，直接返回
        }
        
        p.dataset.isEditing = 'true';  // 設置編輯狀態
        enableEditing(textContainer, textSpan, editIcon);
    };
    
    // 創建左側文字容器
    const textContainer = document.createElement('div');
    textContainer.style.cssText = `
        flex: 1;
        display: flex;
        align-items: center;
    `;
    
    // 添加文字內容
    const textSpan = document.createElement('span');
    textSpan.textContent = `[${time}] ${text}`;
    textSpan.style.cssText = `
        flex: 1;
        min-width: 0;
    `;
    textContainer.appendChild(textSpan);
    
    // 創建右側圖標容器
    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: 10px;
    `;
    
  
    // 添加 Ask ChatGPT 圖標
    const askIcon = document.createElement('i');
    askIcon.className = 'fas fa-robot';
    askIcon.style.cssText = `
        cursor: pointer;
        color: #2196F3;
        transition: color 0.3s ease;
        font-size: 16px;
    `;
    
    // 添加點擊事件
    askIcon.onclick = async () => {
        // 創建建議選項容器
        let suggestionsContainer = p.nextElementSibling;
        if (!suggestionsContainer || !suggestionsContainer.classList.contains('suggestions-container')) {
            suggestionsContainer = document.createElement('div');
            suggestionsContainer.className = 'suggestions-container';
            suggestionsContainer.style.cssText = `
                margin-top: 8px;
                padding: 5px;
                border-radius: 5px;
                background-color: #f8f9fa;
            `;
            p.after(suggestionsContainer);
        }

        try {
            const cleanText = textSpan.textContent.replace(/^\[.*?\]\s*/, '');
            const suggestions = await askChatgptForSuggestion(cleanText, suggestionsContainer);
            
            suggestionsContainer.innerHTML = ''; // 清空容器
            
            // 創建建議選項
            suggestions.forEach((suggestion) => {
                const suggestionEl = document.createElement('div');
                suggestionEl.className = 'suggestion-item';
                suggestionEl.innerHTML = suggestion;
                suggestionEl.style.cssText = `
                    padding: 8px;
                    margin: 5px 0;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                `;
                
                // 單擊事件 - 選中效果
                suggestionEl.addEventListener('click', () => {
                    document.querySelectorAll('.suggestion-item').forEach(el => {
                        el.style.borderColor = '#ddd';
                    });
                    suggestionEl.style.borderColor = '#2196F3';
                });
                
                // 雙擊事件 - 確認選擇
                suggestionEl.addEventListener('dblclick', () => {
                    const timeStampMatch = textSpan.textContent.match(/^\[.*?\]\s*/);
                    const timeStamp = timeStampMatch ? timeStampMatch[0] : '';
                    const plainText = suggestion.replace(/<[^>]*>/g, '');
                    textSpan.textContent = timeStamp + plainText;
                    suggestionsContainer.remove();
                });
                
                suggestionsContainer.appendChild(suggestionEl);
            });
        } catch (error) {
            console.error('處理建議時出錯:', error);
            suggestionsContainer.innerHTML = `獲取建議失敗: ${error.message}`;
        }
    };
    
    // 新增：添加箭頭圖標
    const arrowIcon = document.createElement('i');
    arrowIcon.className = 'fas fa-arrow-right';
    arrowIcon.style.cssText = `
        cursor: pointer;
        color: #666;
        transition: color 0.3s ease;
        font-size: 16px;
    `;

    // 為箭頭圖標添加點擊事件
    arrowIcon.onclick = (e) => {
        e.stopPropagation();
        
        // 獲取 textarea 元素
        const textarea = document.querySelector('textarea.form-control');
        if (!textarea) return;

        // 獲取純文字內容（不包含時間標記）
        const cleanText = textSpan.textContent.replace(/^\[.*?\]\s*/, '');
        
        // 檢查 textarea 是否已有內容
        if (textarea.value.trim()) {
            // 如果已有內容，添加逗號和空格後連接新文字
            textarea.value = textarea.value.trim() + '，' + cleanText;
        } else {
            // 如果沒有內容，直接設置新文字
            textarea.value = cleanText;
        }
        
        // 可選：聚焦到 textarea
        textarea.focus();
    };

    // 將圖標添加到圖標容器
    iconContainer.appendChild(editIcon);
    iconContainer.appendChild(askIcon);
    iconContainer.appendChild(arrowIcon);
    
    // 將文字容器和圖標容器添加到主容器
    p.appendChild(textContainer);
    p.appendChild(iconContainer);
    
    output.appendChild(p);
    
    // 重新添加中間結果到最下方（如果存在）
    if (interimElement) {
        output.appendChild(interimElement);
    }
    
    output.scrollTop = output.scrollHeight;
}

// 詢問 ChatGPT 獲取建議
async function askChatgptForSuggestion(text, suggestionsContainer) {
    try {
        // 顯示加載中
        suggestionsContainer.innerHTML = '';
        const loadingText = document.createElement('div');
        loadingText.textContent = '正在生成建議...';
        suggestionsContainer.appendChild(loadingText);

        const response = await fetch('/api/suggestions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: text })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.message || data.error);
        }
        
        suggestionsContainer.innerHTML = ''; // 清除加載提示
        
        // 確保 data.suggestions 存在且是數組
        if (!data.suggestions || !Array.isArray(data.suggestions)) {
            throw new Error('無效的建議格式');
        }
        
        return data.suggestions;
    } catch (error) {
        console.error('獲取建議失敗:', error);
        suggestionsContainer.innerHTML = `獲取建議失敗: ${error.message}`;
        throw error;
    }
}

// 完整的 enableEditing 函數
async function enableEditing(textContainer, textSpan, editIcon) {
    // 檢查是否已經在編輯狀態
    const parentElement = textContainer.closest('p');
    if (parentElement.querySelector('input')) {
        return; // 如果已經在編輯狀態，則不重複創建
    }

    // 創建輸入框
    const input = document.createElement('input');
    
    // 分離時間戳記和文字內容
    const timeStampMatch = textSpan.textContent.match(/^\[.*?\]\s*/);
    const timeStamp = timeStampMatch ? timeStampMatch[0] : '';
    const cleanText = textSpan.textContent.replace(/^\[.*?\]\s*/, '');
    
    // 設置輸入框的樣式和值
    input.type = 'text';
    input.value = cleanText;
    input.style.cssText = `
        flex: 1;
        min-width: 0;
        padding: 5px;
        border: 1px solid #ddd;
        border-radius: 3px;
        font-size: inherit;
        font-family: inherit;
    `;
    
    // 添加確認圖標
    const confirmIcon = document.createElement('i');
    confirmIcon.className = 'fas fa-check';
    confirmIcon.style.cssText = `
        cursor: pointer;
        color: #4CAF50;
        margin-left: 10px;
    `;
    
    // 添加取消圖標
    const cancelIcon = document.createElement('i');
    cancelIcon.className = 'fas fa-times';
    cancelIcon.style.cssText = `
        cursor: pointer;
        color: #f44336;
        margin-left: 10px;
    `;
    
    // 修改確認編輯函數
    const confirmEdit = () => {
        textSpan.textContent = timeStamp + input.value;
        restoreNormalState(textContainer, textSpan, input, editIcon, confirmIcon, cancelIcon);
        // 重置編輯狀態，允許再次編輯
        parentElement.dataset.isEditing = 'false';
    };
    confirmIcon.onclick = confirmEdit;
    
    // 取消編輯
    cancelIcon.onclick = () => {
        restoreNormalState(textContainer, textSpan, input, editIcon, confirmIcon, cancelIcon);
    };
    
    // 添加鍵盤事件監聽
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmEdit();
        } else if (e.key === 'Escape') {
            cancelIcon.onclick();
        }
    });
    
    // 隱藏原本的文字和編輯圖標
    textSpan.style.display = 'none';
    editIcon.style.display = 'none';
    
    // 將新元素添加到 DOM
    textContainer.insertBefore(input, textSpan);
    textContainer.appendChild(confirmIcon);
    textContainer.appendChild(cancelIcon);
    
    // 自動聚焦到輸入框
    input.focus();
}

// 修改 restoreNormalState 函數
function restoreNormalState(textContainer, textSpan, input, editIcon, confirmIcon, cancelIcon) {
    // 移除編輯相關元素
    input.remove();
    confirmIcon.remove();
    cancelIcon.remove();
    
    // 恢復原始元素的顯示
    textSpan.style.display = '';
    editIcon.style.display = '';
    
    // 重置編輯狀態，允許再次編輯
    const parentElement = textContainer.closest('p');
    if (parentElement) {
        parentElement.dataset.isEditing = 'false';
    }
}

// 添加頁面可見性變化監聽
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (!isConnected) {
            console.log('頁面可見，檢測到連接已斷開，嘗試重新連接...');
            connectToBackend();
        }
    }
});

// 修改更新中間結果的函數
function updateInterimResult(text) {
    const output = document.getElementById('output');
    let interimElement = output.querySelector('.interim');
    
    if (!interimElement) {
        interimElement = document.createElement('p');
        interimElement.className = 'interim';
        // 設置中間結果的樣式
        interimElement.style.cssText = `
            position: relative;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 5px;
            margin: 5px 0;
            color: #666;  // 使用較淺的顏色區分中間結果
            font-style: italic;  // 使用斜體進一步區分
        `;
        // 添加到輸出區域的最下方
        output.appendChild(interimElement);
    }
    
    const time = new Date().toLocaleTimeString();
    interimElement.textContent = `[${time}] ${text}`;
    output.scrollTop = output.scrollHeight;  // 滾動到底部
}

async function askClaude(question) {
    try {
        const response = await fetch('/api/ask-claude', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question })
        });

    
        // 1. 將當前問題添加到previous-question區域
        document.getElementById('previous-question').textContent = `上一個問題: ${question}`;
        
        // 2. 清空輸入框
        document.getElementById('claude-input').value = '';
        
        // 3. 清空輸出區域，等待新回應
        document.getElementById('claude-output').textContent = '思考中...';
        

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 創建 EventSource 來處理 SSE
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            
            const chunk = decoder.decode(value);
            // 處理每個 SSE 事件
            chunk.split('\n').forEach(line => {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        // 立即更新 UI
                        updateClaudeOutput(data.text || '');
                    } catch (e) {
                        console.error('Parse error:', e);
                    }
                }
            });
        }
    } catch (error) {
        throw new Error(`錯誤: ${error.message}`);
    }
}


// 更新輸出區域的函數
function updateClaudeOutput(content) {
    const claudeOutput = document.getElementById('claude-output');
    if (!claudeOutput) {
        console.error('找不到輸出元素');
        return;
    }

    // 如果當前內容是"思考中..."且有新的內容，則清空後再添加新內容
    if (claudeOutput.textContent === '思考中...') {
        claudeOutput.textContent = '';
    }
    
    if (claudeOutput && content) {
        // 追加新文本，而不是替換
        claudeOutput.textContent += content;
    }
}