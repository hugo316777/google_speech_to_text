require('dotenv').config();
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const WebSocket = require('ws');
const { OpenAI } = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs');
const { 
    ALL_PHRASES,
    CORRECTIONS_MAP, 
    TECHNICAL_TERMS, 
    SYSTEM_PROMPTS,
    EXPERIENCE_KEYWORDS,
    PROBLEM_KEYWORDS,
    QUESTION_TEMPLATES,
    USER_PROMPTS
} = require('./config/languageConfig');
const { PATH_CONFIG } = require('./config/pathConfig');



// 2. 配置 dotenv，加載 .env 文件
dotenv.config();
const credentialsPath = PATH_CONFIG.CREDENTIALS;

const recorder = require('node-record-lpcm16');
const speech = require('@google-cloud/speech');

// 初始化 Express
const app = express();
const PORT = 8081;

// 添加中間件處理 JSON 請求
app.use(express.json());

// 服務靜態文件
app.use(express.static(PATH_CONFIG.FRONTEND));

// 創建 HTTP 服務器
const server = app.listen(PORT, () => {
    console.log(`HTTP 服務器運行在端口 ${PORT}`);
});

// 創建 WebSocket 服務器
const wss = new WebSocket.Server({ server });

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 初始化 Anthropic
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// 當有新的 WebSocket 連接時
wss.on('connection', (ws) => {
    console.log('瀏覽器已連接');
    let recognizeStream = null;  // 用於存儲識別流
    let recordStream = null;     // 用於存儲錄音流

    // 防抖和節流相關變量
    let debounceTimer = null;
    let throttleTimer = null;
    let pendingResults = [];
    const DEBOUNCE_DELAY = 1000;  // 最終結果防抖延遲
    const THROTTLE_DELAY = 500;  // 中間結果節流延遲
    let lastInterimResult = '';   // 記錄上一次發送的中間結果

    // 語音識別邏輯
    const client = new speech.SpeechClient({
        keyFilename: credentialsPath
    });

    const encoding = 'LINEAR16';
    const sampleRateHertz = 16000;

    const request = {
        config: {
            encoding: encoding,
            sampleRateHertz: sampleRateHertz,
            languageCode: 'zh-TW',
            alternativeLanguageCodes: ['en-US'], // 添加英文支援
            enableAutomaticPunctuation: false, // 啟用標點符號
            useEnhanced: true,
            metadata: {
                interactionType: 'DICTATION',
                microphoneDistance: 'NEARFIELD',
                industry: 'TECH', // 指定技術領域
            },
            // 添加技術詞彙上下文
            speechContexts: [
                {
                    phrases: ALL_PHRASES,
                    boost: 20  // 提升這些詞彙的權重
                }
            ],
            // 自訂模型選項
            model: 'default',  // 或考慮使用 'video' 模型
            profanityFilter: false,  // 允許所有用語
            enableWordConfidence: true,  // 啟用字詞信心度
            enableWordTimeOffsets: true  // 啟用時間標記
        },
        interimResults: true,
    };
    
    // 修改 processTranscript 函數
    const processTranscript = (transcript) => {
        let processedText = transcript;
        
        // 套用修正
        Object.entries(CORRECTIONS_MAP).forEach(([wrong, correct]) => {
            processedText = processedText.replace(new RegExp(wrong, 'gi'), correct);
        });
    
        // 保持技術術語的大小寫
        Object.entries(TECHNICAL_TERMS).forEach(([lower, proper]) => {
            processedText = processedText.replace(new RegExp(`\\b${lower}\\b`, 'gi'), proper);
        });
    
        return processedText;
    };

    // 開始錄音和識別
    function startRecording() {
        // 創建識別流
        recognizeStream = client
            .streamingRecognize(request)
            .on('error', error => {
                console.error(error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message
                }));
            })
            .on('data', data => {
                const result = data.results[0];
                if (result && result.alternatives[0]) {
                    const transcript = result.alternatives[0].transcript;
                    const confidence = data.results[0].alternatives[0].confidence;

                    if (result.isFinal) {
                        // 最終結果使用防抖
                        if (debounceTimer) clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            console.log(`最終結果: ${transcript}`);
                             // 只處理較高信心度的結果
                    if (confidence > 0.7) {
                        const processedTranscript = processTranscript(transcript);
                        console.log(`處理後文字: ${processedTranscript}`);
                    
                            ws.send(JSON.stringify({
                                type: 'transcript',
                                text: processedTranscript,
                                isFinal: true
                            }));
                        }
                        }, DEBOUNCE_DELAY);
                    } else {
                        // 中間結果使用節流
                        if (!throttleTimer && transcript !== lastInterimResult) {
                            console.log(`中間結果: ${transcript}`);
                            ws.send(JSON.stringify({
                                type: 'transcript',
                                text: transcript,
                                isFinal: false
                            }));
                            lastInterimResult = transcript;
                            
                            throttleTimer = setTimeout(() => {
                                throttleTimer = null;
                            }, THROTTLE_DELAY);
                        }
                    }
                }
            });

        // 創建錄音流
        recordStream = recorder
            .record({
                sampleRateHertz: sampleRateHertz,
                threshold: 0.3,
                verbose: false,
                recordProgram: 'rec',
                silence: '10.0',
            })
            .stream()
            .on('error', console.error)
            .pipe(recognizeStream);
    }

    // 停止錄音和識別
    function stopRecording() {
        if (recordStream) {
            recordStream.unpipe();
            recordStream.destroy();
        }
        if (recognizeStream) {
            recognizeStream.end();
        }
    }

    // 開始錄音
    startRecording();

    // 當 WebSocket 連接關閉時
    ws.on('close', () => {
        console.log('瀏覽器斷開連接');
        stopRecording();
        
        // 清理計時器
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        if (throttleTimer) {
            clearTimeout(throttleTimer);
        }
    });
});

// 添加新的路由處理建議請求
app.post('/api/suggestions', async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ 
                error: '無效的請求',
                message: '請提供文字內容'
            });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPTS.TEXT_CORRECTION
                },
                {
                    role: "user",
                    content: `${USER_PROMPTS.TEXT_CORRECTION_REQUEST}${text}`
                }
            ],
            temperature: 0.7,
            max_tokens: 200
        });

        // 確保返回的是數組格式
        const content = completion.choices[0].message.content;
        const suggestions = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .slice(0, 3);
        
        if (suggestions.length === 0) {
            throw new Error('無法生成建議');
        }
        
        res.json({ suggestions }); // 返回一個包含建議數組的對象
    } catch (error) {
        console.error('OpenAI API 調用失敗:', error);
        res.status(500).json({ 
            error: '獲取建議失敗',
            message: error.message 
        });
    }
});

// 定義關鍵字列表
const KEYWORDS = EXPERIENCE_KEYWORDS;
const KEYWORDS2 = PROBLEM_KEYWORDS;

// 檢查是否需要使用文檔
function shouldUseDocument(question) {
    return KEYWORDS.some(keyword => question.includes(keyword));
}

function shouldResponseHowToSolve(question) {
    return KEYWORDS2.some(keyword => question.includes(keyword));
}

function handleQuestion(question) {
    let totalQuestion = question;
    if (shouldUseDocument(question)) {
        totalQuestion = `${QUESTION_TEMPLATES.RESUME_PREFIX}${documentText}，自動揣測模擬生成回應以下問題：${question}`;
    }
    if (shouldResponseHowToSolve(question)) {
        totalQuestion += QUESTION_TEMPLATES.SOLUTION_SUFFIX;
    }
    console.log("totalQuestion", totalQuestion);
    return totalQuestion;
}

// 修改文件讀取邏輯，添加錯誤處理
let documentText = '';
try {
    const documentPath = PATH_CONFIG.DOCUMENT;
    documentText = fs.readFileSync(documentPath, 'utf8');
} catch (error) {
    console.error("讀取文件失敗:", error.message);
    documentText = "無法讀取文件，使用空白內容繼續運行。";
}


app.post('/api/ask-claude', async (req, res) => {
    try {
        const { question } = req.body;
        
        // 設置 SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 500,
            system: SYSTEM_PROMPTS.CLAUDE_ASSISTANT,
            messages: [
                { role: "user", content: handleQuestion(question) }
            ],
            temperature: 0,
            stream: true
        });

        // 立即發送初始響應
        res.write('data: {"text": ""}\n\n');

        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta') {
                // 確保每個chunk都是完整的SSE事件
                res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
                // 立即刷新數據
                res.flush?.();
            }
        }

        res.end();

    } catch (error) {
        console.error('Claude API 調用失敗:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});
console.log('開始聆聽，按 Ctrl+C 停止...');