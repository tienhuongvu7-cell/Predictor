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
let allPatterns = [];
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
    console.log('🚀 Đang khởi động hệ thống dự đoán cao cấp...');
    await loadPatterns();
    await fetchAllData();
    console.log('✅ Hệ thống đã sẵn sàng với', allPatterns.length, 'patterns!');
}

// ============ LOAD PATTERNS TỪ FILE ============
async function loadPatterns() {
    try {
        const data = await fs.readFile(PATTERN_FILE, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        
        patterns = {};
        allPatterns = [];
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            
            // Xử lý nhiều định dạng
            let patternKey, patternValue;
            
            // Format 1: "TXXTTXTX": "Xỉu"
            const match1 = trimmed.match(/(["']?)([TX]{8})\1\s*:\s*(["']?)(Tài|Xỉu|TAI|XIU)\3/);
            // Format 2: TXXTTXTX: Xỉu
            const match2 = trimmed.match(/([TX]{8})\s*:\s*(Tài|Xỉu|TAI|XIU)/i);
            // Format 3: "TXXTTXTX", "Xỉu"
            const match3 = trimmed.match(/(["'])([TX]{8})\1\s*,\s*(["'])(Tài|Xỉu|TAI|XIU)\3/);
            
            if (match1) {
                patternKey = match1[2];
                patternValue = match1[4];
            } else if (match2) {
                patternKey = match2[1];
                patternValue = match2[2];
            } else if (match3) {
                patternKey = match3[2];
                patternValue = match3[4];
            }
            
            if (patternKey && patternValue) {
                patternKey = patternKey.toUpperCase();
                patternValue = patternValue.toUpperCase();
                
                // Chuẩn hóa kết quả
                const normalizedValue = patternValue === 'TAI' ? 'Tài' : 
                                       patternValue === 'XIU' ? 'Xỉu' : 
                                       patternValue;
                
                if (normalizedValue === 'Tài' || normalizedValue === 'Xỉu') {
                    patterns[patternKey] = normalizedValue;
                    allPatterns.push({
                        pattern: patternKey,
                        result: normalizedValue,
                        index: index
                    });
                }
            }
        });
        
        console.log(`📊 Đã tải ${Object.keys(patterns).length} patterns từ file cau.txt`);
        
        if (Object.keys(patterns).length === 0) {
            console.log('⚠️ Không tìm thấy patterns, tạo mẫu...');
            createDefaultPatterns();
        }
        
    } catch (error) {
        console.error('❌ Lỗi đọc patterns:', error.message);
        createDefaultPatterns();
    }
}

function createDefaultPatterns() {
    patterns = {
        "TXXTTXTX": "Xỉu", "XXTTXTXX": "Tài", "XTTXTXXT": "Tài",
        "TTXTXXTT": "Tài", "TXTXXTTT": "Xỉu", "XTXXTTTX": "Tài",
        "TXXTTTXX": "Xỉu", "XXTTTXXT": "Tài", "TTTXXXTT": "Xỉu",
        "XXXTTTXX": "Tài", "TXTTXXTX": "Xỉu", "XTTXXTXT": "Tài"
    };
    allPatterns = Object.entries(patterns).map(([pattern, result]) => ({pattern, result}));
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
        const response = await axios.get(SUNWIN_API, { timeout: 10000 });
        if (response.data && Array.isArray(response.data)) {
            sunwinData = response.data.sort((a, b) => b.phien - a.phien);
            console.log(`✅ Sunwin: ${sunwinData.length} phiên, mới nhất: ${sunwinData[0]?.phien}`);
        }
    } catch (error) {
        console.error('❌ Sunwin fetch error:', error.message);
    }
}

async function fetchLc79Data() {
    try {
        const response = await axios.get(LC79_API, { timeout: 10000 });
        if (response.data && response.data.list) {
            lc79Data = response.data.list.sort((a, b) => b.id - a.id);
            console.log(`✅ LC79: ${lc79Data.length} phiên, mới nhất: ${lc79Data[0]?.id}`);
        }
    } catch (error) {
        console.error('❌ LC79 fetch error:', error.message);
    }
}

// ============ THUẬT TOÁN CHÍNH ============
class SuperPredictor {
    constructor() {
        this.algorithmWeights = {
            patternMatching: 0.30,      // So pattern
            diceAnalysis: 0.25,         // Phân tích xúc xắc
            trendDetection: 0.20,       // Phát hiện cầu
            statisticalAnalysis: 0.15,  // Phân tích thống kê
            specialPatterns: 0.10       // Mẫu đặc biệt
        };
    }
    
    // ============ PHÂN TÍCH PATTERN CHÍNH XÁC ============
    analyzePattern(data, source) {
        if (!data || data.length < 8) return null;
        
        const recent8 = data.slice(0, 8);
        
        // Tạo pattern từ 8 phiên gần nhất
        let patternStr = '';
        for (let i = 0; i < 8; i++) {
            const item = recent8[i];
            const result = this.normalizeResult(item, source);
            patternStr += result === 'Tài' ? 'T' : 'X';
        }
        
        // Tìm chính xác pattern
        if (patterns[patternStr]) {
            return {
                prediction: patterns[patternStr],
                confidence: 0.95,
                method: 'Pattern chính xác',
                pattern: patternStr,
                matched: true
            };
        }
        
        // Tìm pattern tương tự (sai số 1-2 vị trí)
        let bestMatch = null;
        let minDistance = 3;
        
        for (const [patternKey, patternValue] of Object.entries(patterns)) {
            const distance = this.calculatePatternDistance(patternStr, patternKey);
            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = {
                    prediction: patternValue,
                    confidence: 0.9 - (distance * 0.1),
                    method: `Pattern tương tự (sai ${distance} vị trí)`,
                    pattern: patternStr,
                    matchedPattern: patternKey,
                    distance: distance
                };
            }
        }
        
        return bestMatch;
    }
    
    // ============ PHÂN TÍCH XÚC XẮC SIÊU CHI TIẾT ============
    analyzeDiceSuper(diceValues, recentData, source) {
        if (!diceValues || diceValues.length !== 3) return null;
        
        const [d1, d2, d3] = diceValues;
        const sorted = [...diceValues].sort((a, b) => a - b);
        const [min, mid, max] = sorted;
        const sum = d1 + d2 + d3;
        
        const predictions = [];
        
        // === THUẬT TOÁN CỔ ĐIỂN ===
        // 1. 3 con chĩa mũi xuống (số nhỏ)
        if (max <= 4 && sum <= 9) {
            predictions.push({
                pred: 'Tài',
                conf: 0.85,
                rule: '3 con số nhỏ (chĩa xuống)',
                priority: 1
            });
        }
        
        // 2. 3 con chĩa lên trên (số cao)
        if (min >= 4 && sum >= 12) {
            predictions.push({
                pred: 'Xỉu',
                conf: 0.85,
                rule: '3 con số cao (chĩa lên)',
                priority: 1
            });
        }
        
        // 3. Số cực thấp (bắt tài mạnh)
        if (sum <= 7) {
            predictions.push({
                pred: 'Tài',
                conf: 0.9,
                rule: 'Tổng ≤7 -> Tài mạnh',
                priority: 2
            });
        }
        
        // 4. Số cực cao (bắt xỉu mạnh)
        if (sum >= 15) {
            predictions.push({
                pred: 'Xỉu',
                conf: 0.9,
                rule: 'Tổng ≥15 -> Xỉu mạnh',
                priority: 2
            });
        }
        
        // === THUẬT TOÁN ĐẶC BIỆT ===
        // 5. Tổng 11 với 4-4-3 -> bắt tiếp tài
        if (sum === 11 && ((d1===4&&d2===4&&d3===3) || (d1===4&&d2===3&&d3===4) || (d1===3&&d2===4&&d3===4))) {
            predictions.push({
                pred: 'Tài',
                conf: 0.95,
                rule: '4-4-3 tổng 11 -> Tài tiếp',
                priority: 3
            });
        }
        
        // 6. Tổng 11 với 5-4-2 -> bắt xỉu
        if (sum === 11 && diceValues.includes(5) && diceValues.includes(4) && diceValues.includes(2)) {
            predictions.push({
                pred: 'Xỉu',
                conf: 0.95,
                rule: '5-4-2 tổng 11 -> Xỉu',
                priority: 3
            });
        }
        
        // 7. Số giữa (3-4-5, 4-5-6) -> theo pattern
        if ((sorted[0]===3&&sorted[1]===4&&sorted[2]===5) || (sorted[0]===4&&sorted[1]===5&&sorted[2]===6)) {
            const patternAnalysis = this.analyzePattern(recentData, source);
            if (patternAnalysis) {
                predictions.push({
                    pred: patternAnalysis.prediction,
                    conf: 0.7,
                    rule: 'Số giữa -> theo pattern',
                    priority: 1
                });
            }
        }
        
        // 8. Đối xứng (ví dụ: 1-6-1, 2-5-2, 3-4-3)
        const diff1 = Math.abs(d1 - d3);
        const diff2 = Math.abs(d2 - Math.min(d1, d3));
        if (diff1 <= 1 && diff2 >= 3) {
            predictions.push({
                pred: sum <= 10 ? 'Tài' : 'Xỉu',
                conf: 0.75,
                rule: 'Dạng đối xứng',
                priority: 2
            });
        }
        
        // 9. Cặp đôi (ví dụ: 1-1-6, 2-2-5, 3-3-4)
        if (d1 === d2 || d2 === d3 || d1 === d3) {
            const pairValue = d1 === d2 ? d1 : d2 === d3 ? d2 : d1;
            const singleValue = d1 === d2 ? d3 : d2 === d3 ? d1 : d2;
            
            if (pairValue <= 3 && singleValue >= 4) {
                predictions.push({
                    pred: 'Tài',
                    conf: 0.8,
                    rule: `Cặp số nhỏ (${pairValue}) + số lớn (${singleValue})`,
                    priority: 2
                });
            } else if (pairValue >= 4 && singleValue <= 3) {
                predictions.push({
                    pred: 'Xỉu',
                    conf: 0.8,
                    rule: `Cặp số lớn (${pairValue}) + số nhỏ (${singleValue})`,
                    priority: 2
                });
            }
        }
        
        if (predictions.length === 0) return null;
        
        // Sắp xếp theo priority và confidence
        predictions.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.conf - a.conf;
        });
        
        // Lấy dự đoán tốt nhất
        const bestPred = predictions[0];
        
        return {
            prediction: bestPred.pred,
            confidence: bestPred.conf,
            method: `Phân tích xúc xắc: ${bestPred.rule}`,
            rulesApplied: predictions.map(p => p.rule),
            totalPredictions: predictions.length
        };
    }
    
    // ============ PHÁT HIỆN CẦU NÂNG CAO ============
    detectAdvancedTrends(data, source) {
        if (!data || data.length < 10) return null;
        
        const recentResults = data.slice(0, 15).map(item => this.normalizeResult(item, source));
        
        // === THUẬT TOÁN CẦU BỆT ===
        let currentStreak = 1;
        for (let i = 1; i < recentResults.length; i++) {
            if (recentResults[i] === recentResults[0]) {
                currentStreak++;
            } else {
                break;
            }
        }
        
        // Cầu bệt TÀI >= 4 tay -> bẻ XỈU
        if (currentStreak >= 4 && recentResults[0] === 'Tài') {
            return {
                prediction: 'Xỉu',
                confidence: Math.min(0.9, 0.6 + (currentStreak * 0.05)),
                method: `Cầu bệt Tài ${currentStreak} tay -> Bẻ Xỉu`,
                streak: currentStreak,
                type: 'BETL_T'
            };
        }
        
        // Cầu bệt XỈU >= 4 tay -> bẻ TÀI
        if (currentStreak >= 4 && recentResults[0] === 'Xỉu') {
            return {
                prediction: 'Tài',
                confidence: Math.min(0.9, 0.6 + (currentStreak * 0.05)),
                method: `Cầu bệt Xỉu ${currentStreak} tay -> Bẻ Tài`,
                streak: currentStreak,
                type: 'BETL_X'
            };
        }
        
        // === THUẬT TOÁN CẦU 1-1 (T-X-T-X) ===
        let isAlternating = true;
        for (let i = 0; i < Math.min(6, recentResults.length - 1); i++) {
            if (recentResults[i] === recentResults[i + 1]) {
                isAlternating = false;
                break;
            }
        }
        
        if (isAlternating) {
            const nextPred = recentResults[0] === 'Tài' ? 'Xỉu' : 'Tài';
            return {
                prediction: nextPred,
                confidence: 0.85,
                method: 'Cầu 1-1 (T-X-T-X) -> Ngược lại',
                pattern: recentResults.slice(0, 4).join('-'),
                type: 'ALTERNATING'
            };
        }
        
        // === THUẬT TOÁN CẦU 2-1-2 ===
        if (recentResults.length >= 5) {
            const pattern5 = recentResults.slice(0, 5).join('');
            
            // Mẫu: TTXTT hoặc XXTXX
            if (/^TTXTT$/.test(pattern5) || /^XXTXX$/.test(pattern5)) {
                const prediction = pattern5.startsWith('TT') ? 'Xỉu' : 'Tài';
                return {
                    prediction: prediction,
                    confidence: 0.8,
                    method: 'Cầu 2-1-2 -> Đảo chiều',
                    pattern: pattern5,
                    type: '2-1-2'
                };
            }
        }
        
        // === THUẬT TOÁN CẦU 3-1-3 ===
        if (recentResults.length >= 7) {
            const pattern7 = recentResults.slice(0, 7).join('');
            
            // Mẫu: TTTXTTT hoặc XXXTXXX
            if (/^TTTXTTT$/.test(pattern7) || /^XXXTXXX$/.test(pattern7)) {
                const prediction = pattern7.startsWith('TTT') ? 'Xỉu' : 'Tài';
                return {
                    prediction: prediction,
                    confidence: 0.85,
                    method: 'Cầu 3-1-3 -> Đảo chiều mạnh',
                    pattern: pattern7,
                    type: '3-1-3'
                };
            }
        }
        
        // === THUẬT TOÁN CẦU GÃY ===
        if (recentResults.length >= 3) {
            const firstTwoSame = recentResults[0] === recentResults[1];
            const thirdDifferent = recentResults[1] !== recentResults[2];
            
            if (firstTwoSame && thirdDifferent) {
                // Cầu vừa gãy (TTX hoặc XXT) -> tiếp tục xu hướng mới
                return {
                    prediction: recentResults[2],
                    confidence: 0.75,
                    method: 'Cầu vừa gãy -> Tiếp tục xu hướng mới',
                    pattern: recentResults.slice(0, 3).join(''),
                    type: 'BROKEN'
                };
            }
        }
        
        // === THUẬT TOÁN XÁC SUẤT ===
        const taiCount = recentResults.filter(r => r === 'Tài').length;
        const xiuCount = recentResults.length - taiCount;
        const taiRatio = taiCount / recentResults.length;
        
        if (taiRatio >= 0.75) {
            // Nhiều Tài quá -> Xỉu
            return {
                prediction: 'Xỉu',
                confidence: 0.8 + (taiRatio - 0.75) * 2,
                method: `Nhiều Tài (${Math.round(taiRatio*100)}%) -> Bẻ Xỉu`,
                ratio: taiRatio,
                type: 'HIGH_TAI'
            };
        } else if (taiRatio <= 0.25) {
            // Nhiều Xỉu quá -> Tài
            return {
                prediction: 'Tài',
                confidence: 0.8 + (0.25 - taiRatio) * 2,
                method: `Nhiều Xỉu (${Math.round((1-taiRatio)*100)}%) -> Bẻ Tài`,
                ratio: taiRatio,
                type: 'HIGH_XIU'
            };
        }
        
        return null;
    }
    
    // ============ PHÂN TÍCH THỐNG KÊ ============
    analyzeStatistics(data, source) {
        if (!data || data.length < 30) return null;
        
        const recentData = data.slice(0, 50);
        const sums = recentData.map(item => source === 'sunwin' ? item.tong : item.point);
        const results = recentData.map(item => this.normalizeResult(item, source));
        
        // Tính tỷ lệ Tài/Xỉu theo từng tổng điểm
        const sumStats = {};
        sums.forEach((sum, idx) => {
            if (!sumStats[sum]) {
                sumStats[sum] = { Tài: 0, Xỉu: 0, total: 0 };
            }
            sumStats[sum][results[idx]]++;
            sumStats[sum].total++;
        });
        
        // Lấy tổng điểm của phiên gần nhất
        const lastSum = sums[0];
        const lastResult = results[0];
        
        // Tìm xu hướng cho tổng điểm này
        if (sumStats[lastSum] && sumStats[lastSum].total >= 3) {
            const taiRate = sumStats[lastSum]['Tài'] / sumStats[lastSum].total;
            const xiuRate = sumStats[lastSum]['Xỉu'] / sumStats[lastSum].total;
            
            // Nếu có xu hướng rõ (>70%)
            if (taiRate >= 0.7) {
                return {
                    prediction: 'Tài',
                    confidence: taiRate * 0.9,
                    method: `Thống kê: Tổng ${lastSum} -> Tài ${Math.round(taiRate*100)}%`,
                    stats: sumStats[lastSum],
                    type: 'STAT_TAI'
                };
            } else if (xiuRate >= 0.7) {
                return {
                    prediction: 'Xỉu',
                    confidence: xiuRate * 0.9,
                    method: `Thống kê: Tổng ${lastSum} -> Xỉu ${Math.round(xiuRate*100)}%`,
                    stats: sumStats[lastSum],
                    type: 'STAT_XIU'
                };
            }
        }
        
        // Phân tích chu kỳ
        const cycleLengths = [3, 4, 5, 6, 7, 8];
        for (const cycle of cycleLengths) {
            if (this.detectCycle(recentData, cycle, source)) {
                const predictedIndex = cycle;
                if (predictedIndex < recentData.length) {
                    const prediction = this.normalizeResult(recentData[predictedIndex], source);
                    return {
                        prediction: prediction,
                        confidence: 0.75,
                        method: `Chu kỳ ${cycle} phiên`,
                        cycle: cycle,
                        type: 'CYCLE'
                    };
                }
            }
        }
        
        return null;
    }
    
    // ============ THUẬT TOÁN ĐẶC BIỆT ============
    analyzeSpecialCases(data, source) {
        if (!data || data.length < 12) return null;
        
        const recent12 = data.slice(0, 12);
        const results = recent12.map(item => this.normalizeResult(item, source));
        
        // Kiểm tra cầu zigzag phức tạp
        const pattern12 = results.join('');
        
        // Mẫu: TXXTTXXTTXXT (chu kỳ 3)
        if (/(TXX|XTT){3,}/.test(pattern12)) {
            const lastThree = results.slice(0, 3).join('');
            const prediction = lastThree === 'TXX' ? 'T' : lastThree === 'XTT' ? 'X' : null;
            if (prediction) {
                return {
                    prediction: prediction === 'T' ? 'Tài' : 'Xỉu',
                    confidence: 0.8,
                    method: 'Cầu zigzag phức tạp',
                    pattern: pattern12.substring(0, 9),
                    type: 'COMPLEX_ZIGZAG'
                };
            }
        }
        
        // Kiểm tra cầu hình sin
        const changes = [];
        for (let i = 0; i < results.length - 1; i++) {
            changes.push(results[i] === results[i + 1] ? 'S' : 'C'); // Same or Change
        }
        
        const changePattern = changes.join('');
        if (/CSCSCSCSCS/.test(changePattern)) {
            // Cầu đang đổi liên tục
            return {
                prediction: results[0] === 'Tài' ? 'Xỉu' : 'Tài',
                confidence: 0.85,
                method: 'Cầu hình sin (đổi liên tục)',
                type: 'SIN_WAVE'
            };
        }
        
        return null;
    }
    
    // ============ TỔNG HỢP DỰ ĐOÁN ============
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
        const algorithms = [
            this.analyzePattern(data, source),
            this.analyzeDiceSuper(diceValues, data, source),
            this.detectAdvancedTrends(data, source),
            this.analyzeStatistics(data, source),
            this.analyzeSpecialCases(data, source)
        ].filter(p => p !== null);
        
        if (algorithms.length === 0) {
            return this.getFallbackPrediction(data, source);
        }
        
        // Tính điểm tổng hợp
        let taiScore = 0;
        let xiuScore = 0;
        const methodDetails = [];
        
        algorithms.forEach((algo, idx) => {
            const weight = Object.values(this.algorithmWeights)[idx] || 0.15;
            const score = algo.confidence * weight;
            
            if (algo.prediction === 'Tài') {
                taiScore += score;
            } else {
                xiuScore += score;
            }
            
            methodDetails.push({
                algorithm: algo.method,
                prediction: algo.prediction,
                confidence: Math.round(algo.confidence * 100),
                weight: Math.round(weight * 100)
            });
        });
        
        // Quyết định cuối cùng
        const totalScore = taiScore + xiuScore;
        const finalPrediction = taiScore > xiuScore ? 'Tài' : 'Xỉu';
        const finalConfidence = Math.round((Math.max(taiScore, xiuScore) / totalScore) * 100);
        
        // Phân tích độ mạnh của dự đoán
        const predictionStrength = this.analyzePredictionStrength(algorithms, finalPrediction);
        
        // Format response
        return {
            success: true,
            source: source,
            current_session: source === 'sunwin' ? lastResult.phien : lastResult.id,
            next_session: nextPhien,
            du_doan: finalPrediction,
            do_tin_cay: finalConfidence + '%',
            do_manh: predictionStrength,
            phuong_phap: methodDetails.map(m => m.algorithm).join(' | '),
            chi_tiet: {
                algorithms_used: algorithms.length,
                tai_score: Math.round(taiScore * 1000) / 1000,
                xiu_score: Math.round(xiuScore * 1000) / 1000,
                algorithms: methodDetails,
                last_dice: diceValues,
                last_total: source === 'sunwin' ? lastResult.tong : lastResult.point,
                last_result: this.normalizeResult(lastResult, source)
            },
            timestamp: new Date().toISOString()
        };
    }
    
    // ============ HELPER FUNCTIONS ============
    normalizeResult(item, source) {
        const result = source === 'sunwin' ? item.ket_qua : item.resultTruyenThong;
        if (result === 'TAI' || result.includes('TÀI') || result === 'Tài') {
            return 'Tài';
        } else {
            return 'Xỉu';
        }
    }
    
    calculatePatternDistance(pattern1, pattern2) {
        let distance = 0;
        for (let i = 0; i < 8; i++) {
            if (pattern1[i] !== pattern2[i]) distance++;
        }
        return distance;
    }
    
    detectCycle(data, cycleLength, source) {
        if (data.length < cycleLength * 2) return false;
        
        const firstCycle = data.slice(0, cycleLength).map(item => this.normalizeResult(item, source));
        const secondCycle = data.slice(cycleLength, cycleLength * 2).map(item => this.normalizeResult(item, source));
        
        return JSON.stringify(firstCycle) === JSON.stringify(secondCycle);
    }
    
    analyzePredictionStrength(algorithms, finalPrediction) {
        const matchingAlgos = algorithms.filter(a => a.prediction === finalPrediction);
        const matchingConfidence = matchingAlgos.reduce((sum, a) => sum + a.confidence, 0);
        const totalConfidence = algorithms.reduce((sum, a) => sum + a.confidence, 0);
        
        const strengthRatio = matchingConfidence / totalConfidence;
        
        if (strengthRatio >= 0.8) return 'RẤT MẠNH';
        if (strengthRatio >= 0.6) return 'MẠNH';
        if (strengthRatio >= 0.4) return 'TRUNG BÌNH';
        return 'YẾU';
    }
    
    getFallbackPrediction(data, source) {
        const lastResult = data[0];
        const lastSum = source === 'sunwin' ? lastResult.tong : lastResult.point;
        const lastDice = source === 'sunwin' 
            ? [lastResult.xuc_xac_1, lastResult.xuc_xac_2, lastResult.xuc_xac_3]
            : lastResult.dices;
        
        // Fallback logic thông minh hơn
        let prediction;
        if (lastSum <= 9) {
            prediction = 'Tài';
        } else if (lastSum >= 12) {
            prediction = 'Xỉu';
        } else {
            // Tổng 10-11 -> phân tích xúc xắc đơn giản
            const evenCount = lastDice.filter(d => d % 2 === 0).length;
            prediction = evenCount >= 2 ? 'Xỉu' : 'Tài';
        }
        
        return {
            success: true,
            source: source,
            current_session: source === 'sunwin' ? lastResult.phien : lastResult.id,
            next_session: source === 'sunwin' ? lastResult.phien + 1 : lastResult.id + 1,
            du_doan: prediction,
            do_tin_cay: '50%',
            do_manh: 'YẾU',
            phuong_phap: 'Fallback (phân tích cơ bản)',
            chi_tiet: {
                algorithms_used: 0,
                last_dice: lastDice,
                last_total: lastSum,
                last_result: this.normalizeResult(lastResult, source)
            },
            timestamp: new Date().toISOString()
        };
    }
}

// ============ KHỞI TẠO PREDICTOR ============
const predictor = new SuperPredictor();

// ============ ENDPOINTS ============
app.get('/sunwin', async (req, res) => {
    try {
        if (sunwinData.length === 0) {
            await fetchSunwinData();
        }
        
        if (sunwinData.length < 8) {
            return res.json({
                success: false,
                message: `Không đủ dữ liệu Sunwin (cần 8, hiện có: ${sunwinData.length})`
            });
        }
        
        const prediction = predictor.predict(sunwinData, 'sunwin');
        
        res.json({
            success: true,
            data: {
                phiên_trước: {
                    phien: sunwinData[0].phien,
                    xúc_xắc: [sunwinData[0].xuc_xac_1, sunwinData[0].xuc_xac_2, sunwinData[0].xuc_xac_3],
                    tổng: sunwinData[0].tong,
                    kết_quả: sunwinData[0].ket_qua
                },
                phiên_hiện_tại: sunwinData[0].phien,
                phiên_tiếp_theo: sunwinData[0].phien + 1,
                dự_đoán: prediction.du_doan,
                độ_tin_cậy: prediction.do_tin_cay,
                độ_mạnh: prediction.do_manh,
                phương_pháp: prediction.phuong_phap,
                chi_tiết: prediction.chi_tiet,
                patterns_loaded: allPatterns.length
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
                message: `Không đủ dữ liệu LC79 (cần 8, hiện có: ${lc79Data.length})`
            });
        }
        
        const prediction = predictor.predict(lc79Data, 'lc79');
        
        res.json({
            success: true,
            data: {
                phiên_trước: {
                    id: lc79Data[0].id,
                    xúc_xắc: lc79Data[0].dices,
                    điểm: lc79Data[0].point,
                    kết_quả: lc79Data[0].resultTruyenThong
                },
                phiên_hiện_tại: lc79Data[0].id,
                phiên_tiếp_theo: lc79Data[0].id + 1,
                dự_đoán: prediction.du_doan,
                độ_tin_cậy: prediction.do_tin_cay,
                độ_mạnh: prediction.do_manh,
                phương_pháp: prediction.phuong_phap,
                chi_tiết: prediction.chi_tiet,
                patterns_loaded: allPatterns.length
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
    const search = req.query.search || '';
    const limit = parseInt(req.query.limit) || 100;
    const page = parseInt(req.query.page) || 1;
    
    let filtered = allPatterns;
    
    if (search) {
        const searchUpper = search.toUpperCase();
        filtered = filtered.filter(p => 
            p.pattern.includes(searchUpper) || 
            p.result.includes(search)
        );
    }
    
    const total = filtered.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = filtered.slice(start, end);
    
    res.json({
        success: true,
        patterns: paginated,
        pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit)
        },
        stats: {
            total_patterns: allPatterns.length,
            tai_patterns: allPatterns.filter(p => p.result === 'Tài').length,
            xiu_patterns: allPatterns.filter(p => p.result === 'Xỉu').length
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        patterns: {
            total: allPatterns.length,
            loaded: allPatterns.length > 0
        },
        data: {
            sunwin: {
                count: sunwinData.length,
                latest: sunwinData[0]?.phien || 0,
                status: sunwinData.length >= 8 ? 'OK' : 'INSUFFICIENT'
            },
            lc79: {
                count: lc79Data.length,
                latest: lc79Data[0]?.id || 0,
                status: lc79Data.length >= 8 ? 'OK' : 'INSUFFICIENT'
            }
        },
        system: {
            uptime: process.uptime(),
            memory_usage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        }
    });
});

// Home
app.get('/', (req, res) => {
    res.json({
        message: '🎯 HỆ THỐNG DỰ ĐOÁN XÚC XẮC SIÊU CHÍNH XÁC',
        version: '3.0.0 - THUẬT TOÁN NÂNG CAO',
        features: [
            '5 lớp thuật toán kết hợp',
            'Đọc 1000+ patterns từ file cau.txt',
            'Phát hiện 8 loại cầu (bệt, 1-1, 2-1-2, 3-1-3, zigzag, v.v.)',
            'Phân tích xúc xắc chi tiết 9 tầng',
            'Thống kê xác suất nâng cao',
            'Tự động cập nhật thời gian thực'
        ],
        endpoints: {
            sunwin: '/sunwin - Dự đoán Sunwin',
            lc79: '/lc79 - Dự đoán LC79',
            patterns: '/patterns?page=1&limit=100 - Xem patterns',
            health: '/health - Kiểm tra hệ thống'
        },
        algorithms: [
            'Pattern Matching (30%)',
            'Dice Analysis (25%)',
            'Trend Detection (20%)',
            'Statistical Analysis (15%)',
            'Special Patterns (10%)'
        ]
    });
});

// ============ TỰ ĐỘNG CẬP NHẬT ============
async function autoUpdate() {
    console.log('\n🔄 Tự động cập nhật dữ liệu...');
    try {
        await fetchAllData();
        console.log('✅ Cập nhật thành công');
    } catch (error) {
        console.error('❌ Lỗi cập nhật:', error.message);
    }
}

// ============ KHỞI CHẠY SERVER ============
initialize();

// Cập nhật mỗi 20 giây
setInterval(autoUpdate, 20000);

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║        🎲 HỆ THỐNG DỰ ĐOÁN XÚC XẮC CAO CẤP         ║
    ║                  Phiên bản 3.0.0                    ║
    ║            Thuật toán mạnh - Độ chính xác cao       ║
    ╚══════════════════════════════════════════════════════╝
    
    🌐 Server: http://localhost:${PORT}
    📊 Patterns đã tải: ${allPatterns.length}
    ⏰ Tự động cập nhật: Mỗi 20 giây
    
    🔗 Endpoints:
       • /sunwin    - Dự đoán Sunwin
       • /lc79      - Dự đoán LC79  
       • /patterns  - Xem patterns
       • /health    - Kiểm tra hệ thống
       
    🚀 Hệ thống đang chạy...
    `);
});

// Xử lý shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Đang tắt server...');
    process.exit(0);
});