const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Biến lưu trữ dữ liệu
let sunwinData = [];
let lc79Data = [];
let patterns = {};
let lastSunwinPhien = 0;
let lastLc79Id = 0;

// Các API endpoints
const SUNWIN_API = 'http://180.93.52.196:3001/api/his';
const LC79_API = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';

// File paths
const PATTERN_FILE = 'cau.txt';
const LOG_FILE = 'predictions.log';

// Hàm đọc pattern từ file
async function loadPatterns() {
    try {
        const data = await fs.readFile(PATTERN_FILE, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        
        patterns = {};
        lines.forEach(line => {
            const match = line.match(/"([TX]{8})"\s*:\s*"([^"]+)"/);
            if (match) {
                patterns[match[1]] = match[2];
            }
        });
        
        console.log(`Đã tải ${Object.keys(patterns).length} pattern từ file cau.txt`);
    } catch (error) {
        console.error('Lỗi khi đọc file cau.txt:', error);
        // Tạo pattern mẫu nếu file không tồn tại
        patterns = {
            "TXXTTXTX": "Xỉu",
            "XXTTXTXX": "Tài",
            "XTTXTXXT": "Tài",
            "TTXTXXTT": "Tài",
            "TXTXXTTT": "Xỉu"
        };
        
        // Lưu pattern mẫu vào file
        const patternContent = Object.entries(patterns)
            .map(([key, value]) => `"${key}": "${value}"`)
            .join(',\n');
        
        await fs.writeFile(PATTERN_FILE, patternContent);
    }
}

// Hàm lấy dữ liệu từ Sunwin API
async function fetchSunwinData() {
    try {
        const response = await axios.get(SUNWIN_API);
        if (response.data && Array.isArray(response.data)) {
            sunwinData = response.data.sort((a, b) => b.phien - a.phien);
            
            // Kiểm tra phiên mới
            if (sunwinData.length > 0 && sunwinData[0].phien > lastSunwinPhien) {
                lastSunwinPhien = sunwinData[0].phien;
                console.log(`Sunwin: Cập nhật phiên mới ${lastSunwinPhien}`);
                
                // Dự đoán phiên tiếp theo
                const prediction = predictNextResult(sunwinData, 'sunwin');
                await logPrediction('sunwin', prediction);
            }
        }
    } catch (error) {
        console.error('Lỗi khi fetch Sunwin data:', error.message);
    }
}

// Hàm lấy dữ liệu từ LC79 API
async function fetchLc79Data() {
    try {
        const response = await axios.get(LC79_API);
        if (response.data && response.data.list) {
            lc79Data = response.data.list.sort((a, b) => b.id - a.id);
            
            // Kiểm tra phiên mới
            if (lc79Data.length > 0 && lc79Data[0].id > lastLc79Id) {
                lastLc79Id = lc79Data[0].id;
                console.log(`LC79: Cập nhật phiên mới ${lastLc79Id}`);
                
                // Dự đoán phiên tiếp theo
                const prediction = predictNextResult(lc79Data, 'lc79');
                await logPrediction('lc79', prediction);
            }
        }
    } catch (error) {
        console.error('Lỗi khi fetch LC79 data:', error.message);
    }
}

// Hàm tạo pattern từ 8 phiên gần nhất
function createPattern(data) {
    if (data.length < 8) return null;
    
    const recent8 = data.slice(0, 8);
    let pattern = '';
    
    recent8.forEach(item => {
        const result = item.ket_qua || item.resultTruyenThong;
        if (result.includes('TÀI') || result === 'TAI') {
            pattern += 'T';
        } else if (result.includes('XỈU') || result === 'XIU') {
            pattern += 'X';
        }
    });
    
    return pattern;
}

// Hàm phân tích xúc xắc theo thuật toán mới
function analyzeDice(diceValues) {
    if (!diceValues || diceValues.length !== 3) return null;
    
    const [d1, d2, d3] = diceValues.sort((a, b) => a - b);
    const sum = diceValues.reduce((a, b) => a + b, 0);
    
    // Thuật toán phân tích
    let prediction = null;
    
    // Quy tắc 1: 3 con chĩa mũi xuống (số nhỏ)
    if (sum <= 9) {
        if (d1 <= 3 && d2 <= 3 && d3 <= 3) {
            // 3 con số nhỏ -> bắt tài
            prediction = 'Tài';
        } else if (d1 <= 2 && d2 <= 3 && d3 <= 4) {
            // Các số từ 2-3-4 trở xuống -> bắt tài
            prediction = 'Tài';
        }
    }
    
    // Quy tắc 2: 3 con chĩa lên trên (số cao)
    if (sum >= 12) {
        if (d1 >= 4 && d2 >= 4 && d3 >= 4) {
            // 3 con số cao -> bắt xỉu
            prediction = 'Xỉu';
        } else if (d1 >= 5 && d2 >= 5) {
            // Có ít nhất 2 con từ 5 trở lên -> bắt xỉu
            prediction = 'Xỉu';
        }
    }
    
    // Quy tắc 3: Số nằm giữa (4-5-6 hoặc 3-4-5)
    if (sum >= 9 && sum <= 12) {
        if ((d1 === 4 && d2 === 5 && d3 === 6) || 
            (d1 === 3 && d2 === 4 && d3 === 5)) {
            // Nằm giữa -> theo pattern 1-1
            prediction = null; // Để pattern quyết định
        }
    }
    
    // Quy tắc 4: Phát hiện cầu bệt
    if (data.length >= 4) {
        const recent4 = data.slice(0, 4);
        const allSame = recent4.every(item => {
            const result = item.ket_qua || item.resultTruyenThong;
            return result.includes('TÀI') || result === 'TAI';
        }) || recent4.every(item => {
            const result = item.ket_qua || item.resultTruyenThong;
            return result.includes('XỈU') || result === 'XIU';
        });
        
        if (allSame) {
            const lastResult = recent4[0].ket_qua || recent4[0].resultTruyenThong;
            if (lastResult.includes('TÀI') || lastResult === 'TAI') {
                // Bệt tài 7-8 tay -> bẻ xỉu
                if (recent4.length >= 7) prediction = 'Xỉu';
            } else {
                // Bệt xỉu 4-5 tay -> bẻ tài
                if (recent4.length >= 4) prediction = 'Tài';
            }
        }
    }
    
    // Quy tắc 5: Phát hiện cầu 1-1
    if (data.length >= 3) {
        const recent3 = data.slice(0, 3);
        let isAlternating = true;
        let lastType = null;
        
        for (let i = 0; i < recent3.length; i++) {
            const result = recent3[i].ket_qua || recent3[i].resultTruyenThong;
            const currentType = result.includes('TÀI') || result === 'TAI' ? 'T' : 'X';
            
            if (lastType && lastType === currentType) {
                isAlternating = false;
                break;
            }
            lastType = currentType;
        }
        
        if (isAlternating && recent3.length >= 3) {
            // Đang chạy cầu 1-1, dự đoán ngược lại với tay trước
            const lastResult = recent3[0].ket_qua || recent3[0].resultTruyenThong;
            prediction = lastResult.includes('TÀI') || lastResult === 'TAI' ? 'Xỉu' : 'Tài';
        }
    }
    
    return prediction;
}

// Hàm dự đoán kết quả tiếp theo
function predictNextResult(data, source) {
    if (data.length < 8) {
        return {
            success: false,
            message: 'Không đủ dữ liệu (cần ít nhất 8 phiên)'
        };
    }
    
    const recent8 = data.slice(0, 8);
    const pattern = createPattern(recent8);
    
    let prediction = null;
    let method = '';
    
    // 1. Kiểm tra pattern từ file
    if (pattern && patterns[pattern]) {
        prediction = patterns[pattern];
        method = 'Pattern từ file cau.txt';
    }
    
    // 2. Áp dụng thuật toán phân tích xúc xắc
    const lastResult = recent8[0];
    const diceValues = source === 'sunwin' 
        ? [lastResult.xuc_xac_1, lastResult.xuc_xac_2, lastResult.xuc_xac_3]
        : lastResult.dices;
    
    const diceAnalysis = analyzeDice(diceValues);
    if (diceAnalysis) {
        prediction = diceAnalysis;
        method = 'Thuật toán phân tích xúc xắc';
    }
    
    // 3. Nếu không có prediction từ pattern, dùng logic mặc định
    if (!prediction) {
        // Phân tích xu hướng từ 8 phiên
        const taiCount = recent8.filter(item => {
            const result = item.ket_qua || item.resultTruyenThong;
            return result.includes('TÀI') || result === 'TAI';
        }).length;
        
        const xiuCount = 8 - taiCount;
        
        if (taiCount >= 6) {
            prediction = 'Xỉu'; // Nhiều tài quá -> bẻ xỉu
            method = 'Xu hướng đảo chiều (nhiều Tài)';
        } else if (xiuCount >= 6) {
            prediction = 'Tài'; // Nhiều xỉu quá -> bẻ tài
            method = 'Xu hướng đảo chiều (nhiều Xỉu)';
        } else {
            // Ngẫu nhiên có trọng số
            const random = Math.random();
            prediction = random < 0.5 ? 'Tài' : 'Xỉu';
            method = 'Dự đoán ngẫu nhiên';
        }
    }
    
    const nextPhien = source === 'sunwin' 
        ? lastResult.phien + 1
        : lastResult.id + 1;
    
    return {
        success: true,
        source: source,
        current_phien: source === 'sunwin' ? lastResult.phien : lastResult.id,
        next_phien: nextPhien,
        pattern: pattern,
        prediction: prediction,
        method: method,
        recent_results: recent8.map(item => ({
            phien: source === 'sunwin' ? item.phien : item.id,
            dice: source === 'sunwin' 
                ? [item.xuc_xac_1, item.xuc_xac_2, item.xuc_xac_3]
                : item.dices,
            result: item.ket_qua || item.resultTruyenThong,
            total: source === 'sunwin' ? item.tong : item.point
        })),
        timestamp: new Date().toISOString()
    };
}

// Hàm ghi log dự đoán
async function logPrediction(source, prediction) {
    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            source: source,
            ...prediction
        };
        
        const logLine = JSON.stringify(logEntry) + '\n';
        
        await fs.appendFile(LOG_FILE, logLine);
        console.log(`Đã ghi log dự đoán cho ${source}`);
    } catch (error) {
        console.error('Lỗi khi ghi log:', error);
    }
}

// Endpoint Sunwin
app.get('/sunwin', async (req, res) => {
    try {
        if (sunwinData.length === 0) {
            await fetchSunwinData();
        }
        
        const prediction = predictNextResult(sunwinData, 'sunwin');
        
        res.json({
            success: true,
            data: {
                previous_session: sunwinData.length > 0 ? {
                    phien: sunwinData[0].phien,
                    dice: [sunwinData[0].xuc_xac_1, sunwinData[0].xuc_xac_2, sunwinData[0].xuc_xac_3],
                    total: sunwinData[0].tong,
                    result: sunwinData[0].ket_qua
                } : null,
                current_session: sunwinData.length > 0 ? sunwinData[0].phien : null,
                next_session: sunwinData.length > 0 ? sunwinData[0].phien + 1 : null,
                prediction: prediction.prediction || 'Không có dự đoán',
                prediction_details: prediction,
                last_updated: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint LC79
app.get('/lc79', async (req, res) => {
    try {
        if (lc79Data.length === 0) {
            await fetchLc79Data();
        }
        
        const prediction = predictNextResult(lc79Data, 'lc79');
        
        res.json({
            success: true,
            data: {
                previous_session: lc79Data.length > 0 ? {
                    id: lc79Data[0].id,
                    dice: lc79Data[0].dices,
                    point: lc79Data[0].point,
                    result: lc79Data[0].resultTruyenThong
                } : null,
                current_session: lc79Data.length > 0 ? lc79Data[0].id : null,
                next_session: lc79Data.length > 0 ? lc79Data[0].id + 1 : null,
                prediction: prediction.prediction || 'Không có dự đoán',
                prediction_details: prediction,
                last_updated: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint hiển thị patterns
app.get('/patterns', (req, res) => {
    res.json({
        success: true,
        patterns: patterns,
        count: Object.keys(patterns).length
    });
});

// Endpoint thêm pattern mới
app.post('/patterns', async (req, res) => {
    try {
        const { pattern, result } = req.body;
        
        if (!pattern || !result || pattern.length !== 8) {
            return res.status(400).json({
                success: false,
                error: 'Pattern phải có 8 ký tự (T/X) và có kết quả'
            });
        }
        
        // Validate pattern chỉ chứa T/X
        if (!/^[TX]{8}$/.test(pattern)) {
            return res.status(400).json({
                success: false,
                error: 'Pattern chỉ được chứa ký tự T hoặc X'
            });
        }
        
        patterns[pattern] = result;
        
        // Lưu vào file
        const patternContent = Object.entries(patterns)
            .map(([key, value]) => `"${key}": "${value}"`)
            .join(',\n');
        
        await fs.writeFile(PATTERN_FILE, patternContent);
        
        res.json({
            success: true,
            message: 'Đã thêm pattern mới',
            pattern: pattern,
            result: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        sunwin_data_count: sunwinData.length,
        lc79_data_count: lc79Data.length,
        patterns_count: Object.keys(patterns).length,
        last_sunwin_phien: lastSunwinPhien,
        last_lc79_id: lastLc79Id,
        uptime: process.uptime()
    });
});

// Hàm cập nhật dữ liệu định kỳ
async function updateData() {
    console.log('Đang cập nhật dữ liệu...');
    await fetchSunwinData();
    await fetchLc79Data();
}

// Khởi động server
async function startServer() {
    try {
        // Tải patterns
        await loadPatterns();
        
        // Lấy dữ liệu ban đầu
        await updateData();
        
        // Cập nhật dữ liệu mỗi 30 giây
        setInterval(updateData, 20000);
        
        app.listen(PORT, () => {
            console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
            console.log(`📊 Sunwin endpoint: http://localhost:${PORT}/sunwin`);
            console.log(`🎯 LC79 endpoint: http://localhost:${PORT}/lc79`);
            console.log(`📁 Patterns endpoint: http://localhost:${PORT}/patterns`);
            console.log(`❤️ Health check: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('Lỗi khi khởi động server:', error);
        process.exit(1);
    }
}

startServer();
