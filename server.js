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
            // Xử lý nhiều định dạng
            const cleanLine = line.trim();
            if (cleanLine.includes(':')) {
                // Format: "TXXTTXTX": "Xỉu"
                const parts = cleanLine.split(':');
                if (parts.length === 2) {
                    const patternKey = parts[0].trim().replace(/["']/g, '');
                    const patternValue = parts[1].trim().replace(/["',]/g, '');
                    if (patternKey.length === 8 && (patternValue === 'Tài' || patternValue === 'Xỉu')) {
                        patterns[patternKey] = patternValue;
                    }
                }
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
        await savePatternsToFile();
    }
}

// Hàm lưu patterns vào file
async function savePatternsToFile() {
    const patternContent = Object.entries(patterns)
        .map(([key, value]) => `"${key}": "${value}"`)
        .join(',\n');
    
    await fs.writeFile(PATTERN_FILE, patternContent);
}

// Hàm lấy dữ liệu từ Sunwin API
async function fetchSunwinData() {
    try {
        const response = await axios.get(SUNWIN_API, { timeout: 5000 });
        if (response.data && Array.isArray(response.data)) {
            sunwinData = response.data.sort((a, b) => b.phien - a.phien);
            
            // Kiểm tra phiên mới
            if (sunwinData.length > 0 && sunwinData[0].phien > lastSunwinPhien) {
                lastSunwinPhien = sunwinData[0].phien;
                console.log(`✅ Sunwin: Cập nhật phiên mới ${lastSunwinPhien} - ${sunwinData[0].ket_qua}`);
            }
        }
    } catch (error) {
        console.error('❌ Lỗi khi fetch Sunwin data:', error.message);
    }
}

// Hàm lấy dữ liệu từ LC79 API
async function fetchLc79Data() {
    try {
        const response = await axios.get(LC79_API, { timeout: 5000 });
        if (response.data && response.data.list) {
            lc79Data = response.data.list.sort((a, b) => b.id - a.id);
            
            // Kiểm tra phiên mới
            if (lc79Data.length > 0 && lc79Data[0].id > lastLc79Id) {
                lastLc79Id = lc79Data[0].id;
                console.log(`✅ LC79: Cập nhật phiên mới ${lastLc79Id} - ${lc79Data[0].resultTruyenThong}`);
            }
        }
    } catch (error) {
        console.error('❌ Lỗi khi fetch LC79 data:', error.message);
    }
}

// Hàm tạo pattern từ 8 phiên gần nhất
function createPattern(data) {
    if (!data || data.length < 8) return null;
    
    const recent8 = data.slice(0, 8);
    let pattern = '';
    
    recent8.forEach(item => {
        const result = item.ket_qua || item.resultTruyenThong;
        if (result === 'Tài' || result === 'TAI' || result.includes('TÀI')) {
            pattern += 'T';
        } else if (result === 'Xỉu' || result === 'XIU' || result.includes('XỈU')) {
            pattern += 'X';
        }
    });
    
    // Đảm bảo pattern có 8 ký tự
    if (pattern.length === 8) {
        return pattern;
    }
    return null;
}

// Hàm phân tích xúc xắc theo thuật toán mới (ĐÃ SỬA LỖI)
function analyzeDice(diceValues, recentData) {
    if (!diceValues || diceValues.length !== 3) return null;
    
    const sortedDice = [...diceValues].sort((a, b) => a - b);
    const [d1, d2, d3] = sortedDice;
    const sum = diceValues.reduce((a, b) => a + b, 0);
    
    let prediction = null;
    
    // QUY TẮC 1: 3 con số nhỏ (chĩa mũi xuống)
    if (sum <= 9) {
        if (d1 <= 3 && d2 <= 3 && d3 <= 3) {
            // 3 con đều từ 3 trở xuống -> TÀI MẠNH
            prediction = 'Tài';
            console.log('📊 Thuật toán: 3 con số nhỏ (chĩa xuống) -> Tài');
        } else if (sum <= 7) {
            // Tổng rất nhỏ -> Tài
            prediction = 'Tài';
            console.log('📊 Thuật toán: Tổng <= 7 -> Tài');
        }
    }
    
    // QUY TẮC 2: 3 con số cao (chĩa lên trên)
    if (sum >= 12) {
        if (d1 >= 4 && d2 >= 4 && d3 >= 4) {
            // 3 con đều từ 4 trở lên -> XỈU
            prediction = 'Xỉu';
            console.log('📊 Thuật toán: 3 con số cao (chĩa lên) -> Xỉu');
        } else if (sum >= 15) {
            // Tổng rất cao -> Xỉu
            prediction = 'Xỉu';
            console.log('📊 Thuật toán: Tổng >= 15 -> Xỉu');
        }
    }
    
    // QUY TẮC 3: Số nằm giữa
    if (sum >= 10 && sum <= 11) {
        if ((d1 === 4 && d2 === 5 && d3 === 6) || 
            (d1 === 3 && d2 === 4 && d3 === 5)) {
            // Bộ số giữa -> theo pattern 1-1
            prediction = null;
            console.log('📊 Thuật toán: Bộ số giữa -> Theo pattern');
        }
    }
    
    // QUY TẮC 4: Phát hiện cầu bệt (CHỈ KHI CÓ DỮ LIỆU)
    if (recentData && recentData.length >= 4) {
        const recent4 = recentData.slice(0, 4);
        
        // Kiểm tra cầu bệt tài
        const allTai = recent4.every(item => {
            const result = item.ket_qua || item.resultTruyenThong;
            return result === 'Tài' || result === 'TAI' || result.includes('TÀI');
        });
        
        // Kiểm tra cầu bệt xỉu
        const allXiu = recent4.every(item => {
            const result = item.ket_qua || item.resultTruyenThong;
            return result === 'Xỉu' || result === 'XIU' || result.includes('XỈU');
        });
        
        if (allTai) {
            // Bệt tài 4-5 tay -> bẻ xỉu
            if (recent4.length >= 4) {
                prediction = 'Xỉu';
                console.log('📊 Thuật toán: Bệt Tài 4+ tay -> Xỉu');
            }
        } else if (allXiu) {
            // Bệt xỉu 4-5 tay -> bẻ tài
            if (recent4.length >= 4) {
                prediction = 'Tài';
                console.log('📊 Thuật toán: Bệt Xỉu 4+ tay -> Tài');
            }
        }
        
        // QUY TẮC 5: Phát hiện cầu 1-1
        if (recentData.length >= 3) {
            const recent3 = recentData.slice(0, 3);
            let isAlternating = true;
            
            for (let i = 0; i < recent3.length - 1; i++) {
                const currentResult = recent3[i].ket_qua || recent3[i].resultTruyenThong;
                const nextResult = recent3[i + 1].ket_qua || recent3[i + 1].resultTruyenThong;
                
                const currentType = currentResult === 'Tài' || currentResult === 'TAI' ? 'T' : 'X';
                const nextType = nextResult === 'Tài' || nextResult === 'TAI' ? 'T' : 'X';
                
                if (currentType === nextType) {
                    isAlternating = false;
                    break;
                }
            }
            
            if (isAlternating) {
                // Đang chạy cầu 1-1 -> dự đoán ngược với phiên gần nhất
                const lastResult = recent3[0].ket_qua || recent3[0].resultTruyenThong;
                const lastType = lastResult === 'Tài' || lastResult === 'TAI' ? 'T' : 'X';
                
                prediction = lastType === 'T' ? 'Xỉu' : 'Tài';
                console.log('📊 Thuật toán: Cầu 1-1 -> Ngược lại');
            }
        }
    }
    
    // QUY TẮC ĐẶC BIỆT: Tổng 11 với 4-4-3 -> bắt tiếp con tài
    if (sum === 11 && diceValues.includes(4) && diceValues.includes(4) && diceValues.includes(3)) {
        prediction = 'Tài';
        console.log('📊 Thuật toán: 4-4-3 tổng 11 -> Tài tiếp');
    }
    
    // QUY TẮC ĐẶC BIỆT: Tổng 11 với 5-4-2 -> bắt xỉu
    if (sum === 11 && diceValues.includes(5) && diceValues.includes(4) && diceValues.includes(2)) {
        prediction = 'Xỉu';
        console.log('📊 Thuật toán: 5-4-2 tổng 11 -> Xỉu');
    }
    
    return prediction;
}

// Hàm dự đoán kết quả tiếp theo (ĐÃ SỬA LỖI)
function predictNextResult(data, source) {
    if (!data || data.length < 8) {
        return {
            success: false,
            message: 'Không đủ dữ liệu (cần ít nhất 8 phiên)',
            current_count: data ? data.length : 0
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
        console.log(`🔍 Tìm thấy pattern "${pattern}" -> ${prediction}`);
    }
    
    // 2. Áp dụng thuật toán phân tích xúc xắc (Truyền đúng tham số)
    const lastResult = recent8[0];
    const diceValues = source === 'sunwin' 
        ? [lastResult.xuc_xac_1, lastResult.xuc_xac_2, lastResult.xuc_xac_3]
        : lastResult.dices;
    
    // Gọi hàm với đúng tham số
    const diceAnalysis = analyzeDice(diceValues, recent8);
    if (diceAnalysis) {
        prediction = diceAnalysis;
        method = 'Thuật toán phân tích xúc xắc';
    }
    
    // 3. Nếu không có prediction, dùng logic xu hướng
    if (!prediction) {
        const taiCount = recent8.filter(item => {
            const result = item.ket_qua || item.resultTruyenThong;
            return result === 'Tài' || result === 'TAI' || result.includes('TÀI');
        }).length;
        
        const xiuCount = 8 - taiCount;
        
        if (taiCount >= 6) {
            prediction = 'Xỉu';
            method = 'Xu hướng đảo chiều (nhiều Tài)';
        } else if (xiuCount >= 6) {
            prediction = 'Tài';
            method = 'Xu hướng đảo chiều (nhiều Xỉu)';
        } else {
            // Phân tích tổng điểm
            const lastDiceSum = source === 'sunwin' ? lastResult.tong : lastResult.point;
            if (lastDiceSum <= 10) {
                prediction = 'Tài';
                method = 'Xu hướng điểm thấp -> Tài';
            } else {
                prediction = 'Xỉu';
                method = 'Xu hướng điểm cao -> Xỉu';
            }
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
        pattern_matched: pattern && patterns[pattern] ? true : false,
        prediction: prediction,
        method: method,
        last_dice: diceValues,
        last_sum: source === 'sunwin' ? lastResult.tong : lastResult.point,
        last_result: lastResult.ket_qua || lastResult.resultTruyenThong,
        recent_8_results: recent8.map(item => ({
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
        if (prediction.success) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                source: source,
                phien: prediction.current_phien,
                next_phien: prediction.next_phien,
                prediction: prediction.prediction,
                method: prediction.method,
                pattern: prediction.pattern
            };
            
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(LOG_FILE, logLine);
        }
    } catch (error) {
        console.error('Lỗi khi ghi log:', error);
    }
}

// ============ ENDPOINTS ============

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
                total_sessions: sunwinData.length,
                last_updated: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: "Lỗi khi xử lý yêu cầu Sunwin"
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
                total_sessions: lc79Data.length,
                last_updated: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: "Lỗi khi xử lý yêu cầu LC79"
        });
    }
});

// Endpoint hiển thị patterns
app.get('/patterns', (req, res) => {
    res.json({
        success: true,
        patterns: patterns,
        count: Object.keys(patterns).length,
        sample_patterns: Object.keys(patterns).slice(0, 5)
    });
});

// Endpoint thêm pattern mới
app.post('/patterns', async (req, res) => {
    try {
        const { pattern, result } = req.body;
        
        if (!pattern || !result) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu pattern hoặc result'
            });
        }
        
        if (pattern.length !== 8) {
            return res.status(400).json({
                success: false,
                error: 'Pattern phải có đúng 8 ký tự'
            });
        }
        
        if (!/^[TX]{8}$/.test(pattern.toUpperCase())) {
            return res.status(400).json({
                success: false,
                error: 'Pattern chỉ được chứa ký tự T hoặc X (ví dụ: TXXTTXTX)'
            });
        }
        
        const upperPattern = pattern.toUpperCase();
        const validResult = result === 'Tài' || result === 'Xỉu' ? result : 
                          result === 'TAI' ? 'Tài' : 
                          result === 'XIU' ? 'Xỉu' : null;
        
        if (!validResult) {
            return res.status(400).json({
                success: false,
                error: 'Result phải là "Tài" hoặc "Xỉu"'
            });
        }
        
        patterns[upperPattern] = validResult;
        
        // Lưu vào file
        await savePatternsToFile();
        
        res.json({
            success: true,
            message: 'Đã thêm pattern mới thành công',
            pattern: upperPattern,
            result: validResult,
            total_patterns: Object.keys(patterns).length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint xóa pattern
app.delete('/patterns/:pattern', async (req, res) => {
    try {
        const pattern = req.params.pattern.toUpperCase();
        
        if (patterns[pattern]) {
            delete patterns[pattern];
            await savePatternsToFile();
            
            res.json({
                success: true,
                message: `Đã xóa pattern "${pattern}"`,
                total_patterns: Object.keys(patterns).length
            });
        } else {
            res.status(404).json({
                success: false,
                error: `Không tìm thấy pattern "${pattern}"`
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint xem log
app.get('/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        
        try {
            const data = await fs.readFile(LOG_FILE, 'utf8');
            const lines = data.trim().split('\n').filter(line => line);
            const logs = lines.slice(-limit).map(line => JSON.parse(line));
            
            res.json({
                success: true,
                logs: logs.reverse(),
                total: lines.length
            });
        } catch (error) {
            res.json({
                success: true,
                logs: [],
                message: "Chưa có log nào"
            });
        }
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
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Home page
app.get('/', (req, res) => {
    res.json({
        message: '🎲 Dice Prediction API',
        version: '1.0.0',
        endpoints: {
            sunwin: '/sunwin',
            lc79: '/lc79',
            patterns: '/patterns',
            health: '/health',
            logs: '/logs'
        },
        status: 'running',
        patterns_loaded: Object.keys(patterns).length
    });
});

// Hàm cập nhật dữ liệu định kỳ
async function updateData() {
    console.log('\n🔄 Đang cập nhật dữ liệu...');
    try {
        await Promise.all([fetchSunwinData(), fetchLc79Data()]);
        console.log(`✅ Đã cập nhật: Sunwin(${sunwinData.length}), LC79(${lc79Data.length})`);
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật dữ liệu:', error.message);
    }
}

// Khởi động server
async function startServer() {
    try {
        console.log('🚀 Đang khởi động Dice Prediction System...');
        
        // Tải patterns
        await loadPatterns();
        
        // Lấy dữ liệu ban đầu
        await updateData();
        
        // Cập nhật dữ liệu mỗi 10 giây (nhanh hơn để test)
        setInterval(updateData, 10000);
        
        app.listen(PORT, () => {
            console.log('\n========================================');
            console.log(`🎲 Dice Prediction API đã sẵn sàng!`);
            console.log(`📡 Port: ${PORT}`);
            console.log(`⏰ Time: ${new Date().toLocaleString()}`);
            console.log('\n🔗 Các endpoints:');
            console.log(`   🌐 http://localhost:${PORT}/`);
            console.log(`   🎯 Sunwin: http://localhost:${PORT}/sunwin`);
            console.log(`   🎯 LC79: http://localhost:${PORT}/lc79`);
            console.log(`   📊 Patterns: http://localhost:${PORT}/patterns`);
            console.log(`   📈 Logs: http://localhost:${PORT}/logs`);
            console.log(`   ❤️ Health: http://localhost:${PORT}/health`);
            console.log('========================================\n');
        });
    } catch (error) {
        console.error('❌ Lỗi khi khởi động server:', error);
        process.exit(1);
    }
}

// Xử lý lỗi toàn cục
process.on('uncaughtException', (error) => {
    console.error('🔥 Lỗi nghiêm trọng:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('🔥 Promise bị từ chối:', error);
});

startServer();