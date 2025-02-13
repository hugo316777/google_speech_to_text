const AudioRecorder = require('node-audiorecorder');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
require('dotenv').config();

// 設置 ffmpeg 路徑
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 創建臨時目錄
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// 音頻錄製配置
const options = {
    program: 'rec',     // 使用 sox 的 rec 命令
    device: null,       // 使用默認設備
    bits: 16,          // 採樣位深
    channels: 1,       // 單聲道
    encoding: 'signed-integer',
    rate: 16000,       // 採樣率
    type: 'wav',       // 輸出格式
    silence: 1,        // 啟用靜音檢測
    thresholdStart: 1, // 開始錄音的音量閾值
    thresholdStop: 1,  // 停止錄音的音量閾值
    keepSilence: false // 不保留靜音部分
};

// 創建錄音實例
const audioRecorder = new AudioRecorder(options, console);

let isRecording = false;
let currentFile = null;
let recordingTimeout = null;

// 處理音頻文件
async function processAudioFile(filePath) {
    try {
        // 檢查文件大小，如果太小可能就是沒有聲音
        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size;
        
        // 如果文件小於 1KB，可能就是靜音
        if (fileSizeInBytes < 1024) {
            console.log('沒有檢測到聲音，跳過處理');
            return;
        }
        
        console.log('處理音頻文件:', filePath);
        
        // 使用 ffmpeg 檢查音頻是否有實際內容
        await new Promise((resolve, reject) => {
            ffmpeg(filePath)
                .audioFilters('silencedetect=n=-50dB:d=0.3')
                .on('error', reject)
                .on('end', resolve)
                .save(path.join(tempDir, 'temp_check.wav'));
        });
        
        const response = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-1',
            language: 'zh',
            temperature: 0.0,
            prompt: "這是一段會議音頻。" // 修改提示，避免生成無關文字
        });
        
        if (response.text && response.text.trim() !== "這是一段會議音頻。") {
            const time = new Date().toLocaleTimeString();
            console.log(`[${time}] ${response.text}`);
        }
        
    } catch (error) {
        console.error('處理錯誤:', error);
    } finally {
        // 清理文件
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

// 開始錄音
function startRecording() {
    if (isRecording) return;
    
    console.log('開始捕獲系統音頻...');
    console.log('按 Ctrl+C 停止捕獲');
    
    isRecording = true;
    
    // 每 3 秒處理一次音頻
    function record() {
        const timestamp = Date.now();
        currentFile = path.join(tempDir, `audio_${timestamp}.wav`);
        
        // 開始新的錄音
        const fileStream = fs.createWriteStream(currentFile, { encoding: 'binary' });
        audioRecorder.start().stream().pipe(fileStream);
        
        // 3 秒後停止當前錄音並處理
        recordingTimeout = setTimeout(() => {
            const fileToProcess = currentFile;
            audioRecorder.stop();
            processAudioFile(fileToProcess);
            
            // 如果還在錄音狀態，開始下一次錄音
            if (isRecording) {
                record();
            }
        }, 3000);
    }
    
    record();
}

// 停止錄音
function stopRecording() {
    if (!isRecording) return;
    
    console.log('停止捕獲系統音頻');
    isRecording = false;
    
    if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
    }
    
    audioRecorder.stop();
}

// 處理程序退出
process.on('SIGINT', () => {
    stopRecording();
    process.exit();
});

// 啟動程序
startRecording();