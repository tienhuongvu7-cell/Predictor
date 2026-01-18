const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Biến lưu trữ
let sunwinData = [];
let lc79Data = [];
let patterns = {};
let patternCache = new Map();
let predictionHistory = [];

// API Endpoints
const SUNWIN_API = 'http://180.93.52.196:3001/api/his';
const LC79_API = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';

// File paths
const PATTERN_FILE = 'cau.txt';
const LOG_FILE = 'predictions.log';
const HISTORY_FILE = 'prediction_history.json';

// ============ KHỞI TẠO ============
async function initialize() {
    console.log('🚀 Đang khởi động hệ thống dự đoán...');
    await loadPatterns();
    await loadHistory();
    await fetchAllData();
    console.log('✅ Hệ thống đã sẵn sàng!');
}

// ============ PATTERNS ============
async function loadPatterns() {
    try {
        const data = await fs.readFile(PATTERN_FILE, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        
        patterns = {};
        patternCache.clear();
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            // Hỗ trợ nhiều định dạng
            const match1 = trimmed.match(/["']([TX]{8})["']\s*:\s*["']([^"']+)["']/);
            const match2 = trimmed.match(/([TX]{8})\s*:\s*(Tài|Xỉu|TAI|XIU)/i);
            const match3 = trimmed.match(/^([TX]{8})\s+(Tài|Xỉu)/i);
            
            let patternKey, patternValue;
            
            if (match1) {
                patternKey = match1[1];
                patternValue = match1[2];
            } else if (match2) {
                patternKey = match2[1];
                patternValue = match2[2];
            } else if (match3) {
                patternKey = match3[1];
                patternValue = match3[2];
            }
            
            if (patternKey && patternValue) {
                patternKey = patternKey.toUpperCase();
                patternValue = patternValue === 'TAI' ? 'Tài' : 
                              patternValue === 'XIU' ? 'Xỉu' : patternValue;
                
                if (patternValue === 'Tài' || patternValue === 'Xỉu') {
                    patterns[patternKey] = patternValue;
                    
                    // Cache reverse patterns
                    const reverseKey = patternKey.split('').reverse().join('');
                    patternCache.set(patternKey, patternValue);
                    patternCache.set(reverseKey, patternValue);
                }
            }
        });
        
        console.log(`📊 Đã tải ${Object.keys(patterns).length} patterns từ file`);
        
        // Tạo thêm patterns tự động nếu ít
        if (Object.keys(patterns).length < 50) {
            generateAdditionalPatterns();
        }
        
    } catch (error) {
        console.error('❌ Lỗi đọc patterns:', error.message);
        createDefaultPatterns();
    }
}

function generateAdditionalPatterns() {
    const basePatterns = [
        'TTTTTTTT', 'XXXXXXXX', 'TTTTXXXX', 'XXXTTTTX',
        'TTXXTTXX', 'XXTTXXTT', 'TXTXTXTX', 'XTXTXTXT'
    ];
    
    basePatterns.forEach(pattern => {
        if (!patterns[pattern]) {
            const result = Math.random() > 0.5 ? 'Tài' : 'Xỉu';
            patterns[pattern] = result;
        }
    });
}

function createDefaultPatterns() {
    patterns = {
        "TXXTTXTX": "Xỉu", "XXTTXTXX": "Tài", "XTTXTXXT": "Tài",
        "TTXTXXTT": "Tài", "TXTXXTTT": "Xỉu", "XTXXTTTX": "Tài",
        "TXXTTTXX": "Xỉu", "XXTTTXXT": "Tài", "TTTXXXTT": "Xỉu",
        "XXXTTTXX": "Tài", "TXTTXXTX": "Xỉu", "XTTXXTXT": "Tài",
        "TTXXTXXT": "Tài", "XXTXXTTX": "Xỉu", "TXTXTXTX": "Tài",
        "XTXTXTXT": "Xỉu", "TTTXTTTX": "Tài", "XXXTXXXT": "Xỉu",
        "TXTXXTXT": "Tài", "XTXTXXTX": "Xỉu", "TTXXTTXX": "Xỉu",
        "XXTTXXTT": "Tài"
    };
}

// ============ LỊCH SỬ ============
async function loadHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, 'utf8');
        predictionHistory = JSON.parse(data);
        console.log(`📈 Đã tải ${predictionHistory.length} lịch sử dự đoán`);
    } catch (error) {
        predictionHistory = [];
    }
}

async function saveHistory() {
    try {
        await fs.writeFile(HISTORY_FILE, JSON.stringify(predictionHistory, null, 2));
    } catch (error) {
        console.error('Lỗi lưu lịch sử:', error);
    }
}

// ============ FETCH DATA ============
async function fetchAllData() {
    await Promise.allSettled([
        fetchSunwinData(),
        fetchLc79Data()
    ]);
}

async function fetchSunwinData() {
    try {
        const response = await axios.get(SUNWIN_API, { timeout: 8000 });
        if (response.data && Array.isArray(response.data)) {
            sunwinData = response.data.sort((a, b) => b.phien - a.phien);
            console.log(`✅ Sunwin: ${sunwinData.length} phiên`);
        }
    } catch (error) {
        console.error('Sunwin fetch error:', error.message);
    }
}

async function fetchLc79Data() {
    try {
        const response = await axios.get(LC79_API, { timeout: 8000 });
        if (response.data && response.data.list) {
            lc79Data = response.data.list.sort((a, b) => b.id - a.id);
            console.log(`✅ LC79: ${lc79Data.length} phiên`);
        }
    } catch (error) {
        console.error('LC79 fetch error:', error.message);
    }
}

// ============ THUẬT TOÁN NÂNG CAO ============
class AdvancedPrediction {
    constructor() {
        this.weights = {
            pattern: 0.3,
            diceAnalysis: 0.25,
            trendAnalysis: 0.2,
            statistical: 0.15,
            specialRules: 0.1
        };
    }
    
    // 1. PHÂN TÍCH PATTERN
    analyzePattern(data, source) {
        if (data.length < 8) return null;
        
        const recent8 = data.slice(0, 8);
        let pattern = '';
        
        recent8.forEach(item => {
            const result = this.getResult(item, source);
            pattern += result === 'Tài' ? 'T' : 'X';
        });
        
        // Tìm trong patterns
        if (patterns[pattern]) {
            return {
                prediction: patterns[pattern],
                confidence: 0.9,
                method: 'Pattern match',
                pattern: pattern
            };
        }
        
        // Tìm pattern tương tự (Hamming distance <= 2)
        for (const [key, value] of Object.entries(patterns)) {
            if (this.hammingDistance(pattern, key) <= 2) {
                return {
                    prediction: value,
                    confidence: 0.7,
                    method: 'Similar pattern',
                    pattern: pattern,
                    matchedPattern: key
                };
            }
        }
        
        return null;
    }
    
    // 2. PHÂN TÍCH XÚC XẮC NÂNG CAO
    analyzeDiceAdvanced(diceValues, recentData, source) {
        if (!diceValues || diceValues.length !== 3) return null;
        
        const sum = diceValues.reduce((a, b) => a + b, 0);
        const sorted = [...diceValues].sort((a, b) => a - b);
        const [min, mid, max] = sorted;
        
        let predictions = [];
        let confidence = 0;
        
        // === THUẬT TOÁN 1: PHÂN TÍCH SỐ ĐIỂM ===
        if (sum <= 8) {
            predictions.push({pred: 'Tài', conf: 0.8, rule: 'Tổng thấp (≤8)'});
        } else if (sum >= 13) {
            predictions.push({pred: 'Xỉu', conf: 0.8, rule: 'Tổng cao (≥13)'});
        }
        
        // === THUẬT TOÁN 2: PHÂN TÍCH BỘ SỐ ===
        // Bộ số nhỏ chĩa xuống
        if (max <= 4 && sum <= 9) {
            predictions.push({pred: 'Tài', conf: 0.9, rule: 'Bộ số nhỏ'});
        }
        // Bộ số cao chĩa lên
        if (min >= 4 && sum >= 12) {
            predictions.push({pred: 'Xỉu', conf: 0.9, rule: 'Bộ số cao'});
        }
        
        // === THUẬT TOÁN 3: SỐ ĐẶC BIỆT ===
        // 4-4-3 tổng 11 -> bắt tiếp tài
        if (sum === 11 && diceValues.filter(x => x === 4).length >= 2 && diceValues.includes(3)) {
            predictions.push({pred: 'Tài', conf: 0.95, rule: '4-4-3 (tổng 11)'});
        }
        // 5-4-2 tổng 11 -> bắt xỉu
        if (sum === 11 && diceValues.includes(5) && diceValues.includes(4) && diceValues.includes(2)) {
            predictions.push({pred: 'Xỉu', conf: 0.95, rule: '5-4-2 (tổng 11)'});
        }
        
        // === THUẬT TOÁN 4: SỐ GIỮA (3-4-5, 4-5-6) ===
        if ((sorted[0] === 3 && sorted[1] === 4 && sorted[2] === 5) ||
            (sorted[0] === 4 && sorted[1] === 5 && sorted[2] === 6)) {
            // Theo pattern 1-1
            const patternResult = this.analyzePattern(recentData, source);
            if (patternResult) {
                predictions.push({pred: patternResult.prediction, conf: 0.6, rule: 'Số giữa + pattern'});
            }
        }
        
        // === THUẬT TOÁN 5: PHÂN TÍCH ĐỐI XỨNG ===
        const diff = Math.abs(diceValues[0] - diceValues[2]);
        if (diff <= 1) {
            predictions.push({pred: sum <= 10 ? 'Tài' : 'Xỉu', conf: 0.7, rule: 'Đối xứng'});
        }
        
        // Tính toán kết quả cuối cùng
        if (predictions.length === 0) return null;
        
        // Đếm phiếu bầu
        const votes = { 'Tài': 0, 'Xỉu': 0 };
        predictions.forEach(p => {
            votes[p.pred] += p.conf;
        });
        
        const finalPrediction = votes['Tài'] > votes['Xỉu'] ? 'Tài' : 'Xỉu';
        confidence = Math.max(votes['Tài'], votes['Xỉu']) / predictions.reduce((sum, p) => sum + p.conf, 0);
        
        return {
            prediction: finalPrediction,
            confidence: confidence,
            method: 'Dice analysis',
            rules: predictions.map(p => `${p.rule}: ${p.pred}`)
        };
    }
    
    // 3. PHÂN TÍCH XU HƯỚNG (TREND ANALYSIS)
    analyzeTrend(data, source) {
        if (data.length < 10) return null;
        
        const recent20 = data.slice(0, 20);
        const results = recent20.map(item => this.getResult(item, source));
        
        // === THUẬT TOÁN CẦU BỆT ===
        let currentStreak = 1;
        let lastResult = results[0];
        
        for (let i = 1; i < results.length; i++) {
            if (results[i] === lastResult) {
                currentStreak++;
            } else {
                break;
            }
        }
        
        if (currentStreak >= 4) {
            // Cầu bệt >= 4 tay -> bẻ cầu
            return {
                prediction: lastResult === 'Tài' ? 'Xỉu' : 'Tài',
                confidence: Math.min(0.9, currentStreak * 0.15),
                method: `Cầu bệt ${currentStreak} tay`,
                streak: currentStreak
            };
        }
        
        // === THUẬT TOÁN CẦU 1-1 ===
        let isAlternating = true;
        for (let i = 0; i < Math.min(6, results.length - 1); i++) {
            if (results[i] === results[i + 1]) {
                isAlternating = false;
                break;
            }
        }
        
        if (isAlternating) {
            // Đang chạy cầu 1-1 -> dự đoán ngược với phiên trước
            return {
                prediction: results[0] === 'Tài' ? 'Xỉu' : 'Tài',
                confidence: 0.8,
                method: 'Cầu 1-1',
                pattern: 'Alternating'
            };
        }
        
        // === THUẬT TOÁN CẦU 2-1-2 ===
        if (results.length >= 5) {
            const pattern = results.slice(0, 5).join('');
            const patterns2_1_2 = [
                'TàiTàiXỉuTàiTài',
                'XỉuXỉuTàiXỉuXỉu',
                'TàiXỉuXỉuTàiXỉu',
                'XỉuTàiTàiXỉuTài'
            ];
            
            if (patterns2_1_2.includes(pattern)) {
                return {
                    prediction: pattern.includes('TàiTài') ? 'Xỉu' : 'Tài',
                    confidence: 0.75,
                    method: 'Cầu 2-1-2',
                    pattern: pattern
                };
            }
        }
        
        // === THUẬT TOÁN CẦU 3-1-3 ===
        if (results.length >= 7) {
            const pattern7 = results.slice(0, 7).join('');
            if (/^(Tài){3}Xỉu(Tài){3}$/.test(pattern7) || 
                /^(Xỉu){3}Tài(Xỉu){3}$/.test(pattern7)) {
                return {
                    prediction: pattern7.includes('TàiTàiTài') ? 'Xỉu' : 'Tài',
                    confidence: 0.8,
                    method: 'Cầu 3-1-3',
                    pattern: pattern7
                };
            }
        }
        
        // === PHÂN TÍCH XÁC SUẤT ===
        const taiCount = results.filter(r => r === 'Tài').length;
        const xiuCount = results.length - taiCount;
        
        if (taiCount >= results.length * 0.7) {
            // Nhiều tài quá -> bẻ xỉu
            return {
                prediction: 'Xỉu',
                confidence: 0.85,
                method: 'Xu hướng đảo chiều (nhiều Tài)',
                ratio: taiCount / results.length
            };
        } else if (xiuCount >= results.length * 0.7) {
            // Nhiều xỉu quá -> bẻ tài
            return {
                prediction: 'Tài',
                confidence: 0.85,
                method: 'Xu hướng đảo chiều (nhiều Xỉu)',
                ratio: xiuCount / results.length
            };
        }
        
        return null;
    }
    
    // 4. PHÂN TÍCH THỐNG KÊ
    analyzeStatistical(data, source) {
        if (data.length < 30) return null;
        
        const recent50 = data.slice(0, 50);
        const results = recent50.map(item => this.getResult(item, source));
        const diceSums = recent50.map(item => source === 'sunwin' ? item.tong : item.point);
        
        // Tính xác suất theo tổng điểm
        const sumFreq = {};
        diceSums.forEach(sum => {
            sumFreq[sum] = (sumFreq[sum] || 0) + 1;
        });
        
        // Tìm tổng điểm phổ biến nhất
        let mostCommonSum = null;
        let maxFreq = 0;
        for (const [sum, freq] of Object.entries(sumFreq)) {
            if (freq > maxFreq) {
                maxFreq = freq;
                mostCommonSum = parseInt(sum);
            }
        }
        
        if (mostCommonSum !== null) {
            const prediction = mostCommonSum <= 10 ? 'Tài' : 'Xỉu';
            return {
                prediction: prediction,
                confidence: Math.min(0.7, maxFreq / 50 * 1.5),
                method: 'Phân tích thống kê',
                mostCommonSum: mostCommonSum,
                frequency: maxFreq
            };
        }
        
        return null;
    }
    
    // 5. QUY TẮC ĐẶC BIỆT
    analyzeSpecialRules(data, source) {
        if (data.length < 3) return null;
        
        const recent3 = data.slice(0, 3);
        const results = recent3.map(item => this.getResult(item, source));
        const diceValues = recent3.map(item => 
            source === 'sunwin' 
                ? [item.xuc_xac_1, item.xuc_xac_2, item.xuc_xac_3]
                : item.dices
        );
        
        // Kiểm tra cầu gãy
        if (results[0] === results[1] && results[1] !== results[2]) {
            // Cầu vừa gãy -> tiếp tục xu hướng mới
            return {
                prediction: results[2],
                confidence: 0.75,
                method: 'Cầu vừa gãy',
                pattern: `${results[0]}${results[1]}${results[2]}`
            };
        }
        
        // Kiểm tra đuôi cầu
        if (data.length >= 8) {
            const recent8Results = data.slice(0, 8).map(item => this.getResult(item, source));
            const last4 = recent8Results.slice(0, 4);
            const first4 = recent8Results.slice(4, 8);
            
            if (JSON.stringify(last4) === JSON.stringify(first4)) {
                // Lặp lại chu kỳ
                return {
                    prediction: recent8Results[3] === 'Tài' ? 'Xỉu' : 'Tài',
                    confidence: 0.8,
                    method: 'Chu kỳ lặp',
                    cycle: last4.join('')
                };
            }
        }
        
        return null;
    }
    
    // TỔNG HỢP TẤT CẢ THUẬT TOÁN
    predict(data, source) {
        if (!data || data.length < 8) {
            return {
                success: false,
                message: 'Không đủ dữ liệu (cần ít nhất 8 phiên)'
            };
        }
        
        const lastResult = data[0];
        const nextPhien = source === 'sunwin' ? lastResult.phien + 1 : lastResult.id + 1;
        const diceValues = source === 'sunwin' 
            ? [lastResult.xuc_xac_1, lastResult.xuc_xac_2, lastResult.xuc_xac_3]
            : lastResult.dices;
        
        // Chạy tất cả thuật toán
        const predictions = [
            this.analyzePattern(data, source),
            this.analyzeDiceAdvanced(diceValues, data, source),
            this.analyzeTrend(data, source),
            this.analyzeStatistical(data, source),
            this.analyzeSpecialRules(data, source)
        ].filter(p => p !== null);
        
        if (predictions.length === 0) {
            return this.fallbackPrediction(data, source);
        }
        
        // Tính tổng hợp với trọng số
        const weightedVotes = { 'Tài': 0, 'Xỉu': 0 };
        const methods = [];
        
        predictions.forEach((pred, index) => {
            const weight = Object.values(this.weights)[index] || 0.1;
            const voteValue = pred.confidence * weight;
            weightedVotes[pred.prediction] += voteValue;
            methods.push(`${pred.method} (${(pred.confidence * 100).toFixed(0)}%)`);
        });
        
        const finalPrediction = weightedVotes['Tài'] > weightedVotes['Xỉu'] ? 'Tài' : 'Xỉu';
        const finalConfidence = Math.max(weightedVotes['Tài'], weightedVotes['Xỉu']) / 
                               (weightedVotes['Tài'] + weightedVotes['Xỉu']);
        
        // Lưu vào lịch sử
        const predictionRecord = {
            timestamp: new Date().toISOString(),
            source: source,
            phien: nextPhien - 1,
            next_phien: nextPhien,
            prediction: finalPrediction,
            confidence: finalConfidence,
            methods: methods,
            dice: diceValues,
            total_votes: {
                Tài: weightedVotes['Tài'].toFixed(3),
                Xỉu: weightedVotes['Xỉu'].toFixed(3)
            }
        };
        
        predictionHistory.unshift(predictionRecord);
        if (predictionHistory.length > 1000) predictionHistory.pop();
        saveHistory();
        
        return {
            success: true,
            source: source,
            current_phien: source === 'sunwin' ? lastResult.phien : lastResult.id,
            next_phien: nextPhien,
            prediction: finalPrediction,
            confidence: Math.round(finalConfidence * 100),
            algorithms_used: predictions.length,
            method_summary: methods.join('; '),
            last_result: this.getResult(lastResult, source),
            last_dice: diceValues,
            last_sum: source === 'sunwin' ? lastResult.tong : lastResult.point,
            prediction_details: {
                algorithms: predictions.map(p => ({
                    method: p.method,
                    prediction: p.prediction,
                    confidence: Math.round(p.confidence * 100)
                })),
                weighted_votes: {
                    Tài: Math.round(weightedVotes['Tài'] * 1000) / 1000,
                    Xỉu: Math.round(weightedVotes['Xỉu'] * 1000) / 1000
                }
            },
            timestamp: new Date().toISOString()
        };
    }
    
    fallbackPrediction(data, source) {
        const lastResult = data[0];
        const lastSum = source === 'sunwin' ? lastResult.tong : lastResult.point;
        
        // Fallback đơn giản
        const prediction = lastSum <= 10 ? 'Tài' : 'Xỉu';
        
        return {
            success: true,
            source: source,
            current_phien: source === 'sunwin' ? lastResult.phien : lastResult.id,
            next_phien: source === 'sunwin' ? lastResult.phien + 1 : lastResult.id + 1,
            prediction: prediction,
            confidence: 50,
            algorithms_used: 0,
            method_summary: 'Fallback (theo tổng điểm)',
            last_result: this.getResult(lastResult, source),
            last_dice: source === 'sunwin' 
                ? [lastResult.xuc_xac_1, lastResult.xuc_xac_2, lastResult.xuc_xac_3]
                : lastResult.dices,
            last_sum: lastSum,
            timestamp: new Date().toISOString()
        };
    }
    
    // Helper functions
    getResult(item, source) {
        const result = source === 'sunwin' ? item.ket_qua : item.resultTruyenThong;
        return result === 'TAI' || result.includes('TÀI') ? 'Tài' : 'Xỉu';
    }
    
    hammingDistance(str1, str2) {
        let distance = 0;
        for (let i = 0; i < str1.length; i++) {
            if (str1[i] !== str2[i]) distance++;
        }
        return distance;
    }
}

// Khởi tạo predictor
const predictor = new AdvancedPrediction();

// ============ ENDPOINTS ============
app.get('/sunwin', async (req, res) => {
    try {
        if (sunwinData.length === 0) {
            await fetchSunwinData();
        }
        
        if (sunwinData.length < 8) {
            return res.json({
                success: false,
                error: 'Không đủ dữ liệu Sunwin',
                data_count: sunwinData.length
            });
        }
        
        const prediction = predictor.predict(sunwinData, 'sunwin');
        
        // Format response như API gốc
        res.json({
            success: true,
            data: {
                previous_session: {
                    phien: sunwinData[0].phien,
                    xuc_xac_1: sunwinData[0].xuc_xac_1,
                    xuc_xac_2: sunwinData[0].xuc_xac_2,
                    xuc_xac_3: sunwinData[0].xuc_xac_3,
                    tong: sunwinData[0].tong,
                    ket_qua: sunwinData[0].ket_qua
                },
                current_session: sunwinData[0].phien,
                next_session: sunwinData[0].phien + 1,
                du_doan: prediction.prediction,
                do_tin_cay: `${prediction.confidence}%`,
                phuong_phap: prediction.method_summary,
                chi_tiet: prediction.prediction_details
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/lc79', async (req, res) => {
    try {
        if (lc79Data.length === 0) {
            await fetchLc79Data();
        }
        
        if (lc79Data.length < 8) {
            return res.json({
                success: false,
                error: 'Không đủ dữ liệu LC79',
                data_count: lc79Data.length
            });
        }
        
        const prediction = predictor.predict(lc79Data, 'lc79');
        
        // Format response như API gốc
        res.json({
            success: true,
            data: {
                previous_session: {
                    id: lc79Data[0].id,
                    dices: lc79Data[0].dices,
                    point: lc79Data[0].point,
                    resultTruyenThong: lc79Data[0].resultTruyenThong
                },
                current_session: lc79Data[0].id,
                next_session: lc79Data[0].id + 1,
                du_doan: prediction.prediction,
                do_tin_cay: `${prediction.confidence}%`,
                phuong_phap: prediction.method_summary,
                chi_tiet: prediction.prediction_details
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Pattern management
app.get('/patterns', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    
    let filteredPatterns = Object.entries(patterns);
    
    if (search) {
        const searchUpper = search.toUpperCase();
        filteredPatterns = filteredPatterns.filter(([key, value]) => 
            key.includes(searchUpper) || value.includes(search)
        );
    }
    
    const total = filteredPatterns.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    
    res.json({
        success: true,
        patterns: Object.fromEntries(filteredPatterns.slice(start, end)),
        pagination: {
            page,
            limit,
            total,
            total_pages: totalPages
        }
    });
});

app.post('/patterns', async (req, res) => {
    try {
        const { pattern, result } = req.body;
        
        if (!pattern || !result) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu pattern hoặc result'
            });
        }
        
        const cleanPattern = pattern.toUpperCase().replace(/[^TX]/g, '');
        if (cleanPattern.length !== 8) {
            return res.status(400).json({
                success: false,
                error: 'Pattern phải có 8 ký tự T/X'
            });
        }
        
        const cleanResult = result === 'TAI' ? 'Tài' : 
                           result === 'XIU' ? 'Xỉu' : result;
        
        if (cleanResult !== 'Tài' && cleanResult !== 'Xỉu') {
            return res.status(400).json({
                success: false,
                error: 'Result phải là "Tài" hoặc "Xỉu"'
            });
        }
        
        patterns[cleanPattern] = cleanResult;
        
        // Lưu patterns
        const patternContent = Object.entries(patterns)
            .map(([key, value]) => `"${key}": "${value}"`)
            .join(',\n');
        
        await fs.writeFile(PATTERN_FILE, patternContent);
        
        res.json({
            success: true,
            message: 'Pattern đã được thêm',
            pattern: cleanPattern,
            result: cleanResult,
            total_patterns: Object.keys(patterns).length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// History endpoint
app.get('/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const source = req.query.source;
    
    let filtered = predictionHistory;
    if (source) {
        filtered = filtered.filter(h => h.source === source);
    }
    
    res.json({
        success: true,
        history: filtered.slice(0, limit),
        total: filtered.length
    });
});

// Stats endpoint
app.get('/stats', (req, res) => {
    const recentPredictions = predictionHistory.slice(0, 100);
    
    if (recentPredictions.length === 0) {
        return res.json({
            success: true,
            stats: {
                total_predictions: 0,
                accuracy: 'N/A'
            }
        });
    }
    
    // Đếm kết quả
    const counts = {
        Tài: { correct: 0, total: 0 },
        Xỉu: { correct: 0, total: 0 }
    };
    
    // Giả sử chúng ta không có kết quả thực tế ở đây
    // Đây chỉ là thống kê dự đoán
    
    res.json({
        success: true,
        stats: {
            total_predictions: predictionHistory.length,
            recent_predictions: recentPredictions.length,
            patterns_loaded: Object.keys(patterns).length,
            sunwin_data: sunwinData.length,
            lc79_data: lc79Data.length,
            prediction_distribution: {
                Tài: predictionHistory.filter(p => p.prediction === 'Tài').length,
                Xỉu: predictionHistory.filter(p => p.prediction === 'Xỉu').length
            },
            average_confidence: predictionHistory.length > 0 ? 
                Math.round(predictionHistory.reduce((sum, p) => sum + (p.confidence || 0), 0) / predictionHistory.length) : 0
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        data: {
            sunwin: {
                count: sunwinData.length,
                last_phien: sunwinData[0]?.phien || 0,
                status: sunwinData.length > 0 ? 'OK' : 'NO_DATA'
            },
            lc79: {
                count: lc79Data.length,
                last_id: lc79Data[0]?.id || 0,
                status: lc79Data.length > 0 ? 'OK' : 'NO_DATA'
            }
        },
        system: {
            patterns: Object.keys(patterns).length,
            history: predictionHistory.length,
            uptime: process.uptime(),
            memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        }
    });
});

// Home
app.get('/', (req, res) => {
    res.json({
        message: '🎲 Hệ Thống Dự Đoán Xúc Xắc Nâng Cao',
        version: '2.0.0',
        features: [
            '5 thuật toán dự đoán kết hợp',
            'Phân tích pattern nâng cao',
            'Nhận diện cầu bệt, cầu 1-1, cầu 2-1-2, cầu 3-1-3',
            'Phân tích xúc xắc chi tiết',
            'Tự động cập nhật dữ liệu',
            'Quản lý patterns không giới hạn'
        ],
        endpoints: {
            sunwin: '/sunwin - Dự đoán Sunwin',
            lc79: '/lc79 - Dự đoán LC79',
            patterns: '/patterns - Quản lý patterns',
            history: '/history - Lịch sử dự đoán',
            stats: '/stats - Thống kê',
            health: '/health - Health check'
        }
    });
});

// ============ TỰ ĐỘNG CẬP NHẬT ============
async function autoUpdate() {
    console.log('🔄 Tự động cập nhật dữ liệu...');
    try {
        await fetchAllData();
        console.log('✅ Cập nhật thành công');
    } catch (error) {
        console.error('❌ Lỗi cập nhật:', error.message);
    }
}

// ============ KHỞI CHẠY ============
initialize();

// Cập nhật mỗi 15 giây
setInterval(autoUpdate, 15000);

// Cập nhật ngay khi khởi động
setTimeout(autoUpdate, 5000);

app.listen(PORT, () => {
    console.log(`\n🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log('⏰ Hệ thống sẽ tự động cập nhật mỗi 15 giây\n');
});

// Xử lý shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Đang lưu dữ liệu và tắt server...');
    await saveHistory();
    process.exit(0);
});