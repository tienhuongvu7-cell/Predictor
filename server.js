// server.js - CUONGDEVGPT AI TAI XIU SUPER BOT v2.0
// Created by CUONGDEVGPT
// Big dad Cuongdepzaivcl create

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==================== CONFIGURATION ====================
const API_CONFIG = {
    SUNWIN: 'http://180.93.52.196:3001/api/his',
    LC79: 'https://wtxmd52.tele68.com/v1/txmd5/sessions'
};

// ==================== CORE DATA STRUCTURES ====================
class SessionData {
    constructor(phien, xuc_xac_1, xuc_xac_2, xuc_xac_3, tong, ket_qua) {
        this.phien = phien;
        this.xuc_xac_1 = xuc_xac_1;
        this.xuc_xac_2 = xuc_xac_2;
        this.xuc_xac_3 = xuc_xac_3;
        this.tong = tong;
        this.ket_qua = ket_qua;
        this.dices = [xuc_xac_1, xuc_xac_2, xuc_xac_3];
        this.isTai = ket_qua === 'Tài' || ket_qua === 'TAI';
        this.isXiu = ket_qua === 'Xỉu' || ket_qua === 'XIU';
    }
}

class AnalysisResult {
    constructor() {
        this.du_doan = 'Xỉu';
        this.do_tin_cay = '50%';
        this.do_manh = 'TRUNG BÌNH';
        this.phuong_phap = 'Đang phân tích...';
        this.thong_tin_bo_sung = {
            thuat_toan_su_dung: 0,
            patterns_da_tai: 0,
            diem_so: {
                totalAlgorithms: 0,
                agreeingAlgorithms: 0,
                taiScore: '0.00',
                xiuScore: '0.00',
                scoreDifference: '0.00',
                agreementRatio: 0
            },
            xuc_xac_cuoi: [0, 0, 0]
        };
    }
}

// ==================== ALGORITHM 1: CẦU BỆT DÀI ====================
class CauBetAlgorithm {
    analyze(sessions) {
        if (sessions.length < 5) return { prediction: null, confidence: 0, method: '' };
        
        let last5 = sessions.slice(0, 5);
        let allTai = last5.every(s => s.isTai);
        let allXiu = last5.every(s => s.isXiu);
        
        if (allTai) {
            return {
                prediction: 'Tài',
                confidence: 75,
                method: 'Cầu bệt Tài 5 ván liên tiếp',
                score: 3.5
            };
        }
        
        if (allXiu) {
            return {
                prediction: 'Xỉu',
                confidence: 75,
                method: 'Cầu bệt Xỉu 5 ván liên tiếp',
                score: 3.5
            };
        }
        
        // Check for longer streaks
        let streakCount = 1;
        let currentType = sessions[0].isTai ? 'Tài' : 'Xỉu';
        
        for (let i = 1; i < Math.min(sessions.length, 10); i++) {
            if ((sessions[i].isTai && currentType === 'Tài') || 
                (sessions[i].isXiu && currentType === 'Xỉu')) {
                streakCount++;
            } else {
                break;
            }
        }
        
        if (streakCount >= 4) {
            let confidence = Math.min(85, 60 + streakCount * 5);
            return {
                prediction: currentType,
                confidence: confidence,
                method: `Cầu bệt ${currentType} ${streakCount} ván`,
                score: 4.0
            };
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 2: CẦU ĐẢO 1-1 ====================
class CauDaoAlgorithm {
    analyze(sessions) {
        if (sessions.length < 4) return { prediction: null, confidence: 0, method: '' };
        
        let pattern = [];
        for (let i = 0; i < Math.min(sessions.length, 6); i++) {
            pattern.push(sessions[i].isTai ? 'T' : 'X');
        }
        
        // Check 1-1 pattern
        let isAlternating = true;
        for (let i = 0; i < pattern.length - 1; i++) {
            if (pattern[i] === pattern[i + 1]) {
                isAlternating = false;
                break;
            }
        }
        
        if (isAlternating && pattern.length >= 4) {
            let lastIsTai = sessions[0].isTai;
            let prediction = lastIsTai ? 'Xỉu' : 'Tài';
            let confidence = 65 + (pattern.length - 3) * 5;
            
            return {
                prediction: prediction,
                confidence: Math.min(confidence, 80),
                method: `Cầu đảo 1-1 (${pattern.join('-')})`,
                score: 3.0
            };
        }
        
        // Check 2-2 pattern
        if (pattern.length >= 4) {
            let pairsMatch = true;
            for (let i = 0; i < pattern.length - 2; i += 2) {
                if (pattern[i] !== pattern[i + 1]) {
                    pairsMatch = false;
                    break;
                }
            }
            
            if (pairsMatch) {
                let lastPair = pattern[0] + pattern[1];
                let prediction = lastPair === 'TT' ? 'Xỉu' : 'Tài';
                
                return {
                    prediction: prediction,
                    confidence: 70,
                    method: `Cầu đôi 2-2 (${pattern.slice(0, 4).join('')})`,
                    score: 3.2
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 3: CẦU NGHIÊNG ====================
class CauNghiengAlgorithm {
    analyze(sessions) {
        if (sessions.length < 8) return { prediction: null, confidence: 0, method: '' };
        
        let last10 = sessions.slice(0, 10);
        let taiCount = last10.filter(s => s.isTai).length;
        let xiuCount = last10.filter(s => s.isXiu).length;
        
        let ratio = Math.max(taiCount, xiuCount) / 10;
        
        if (ratio >= 0.7) {
            let dominant = taiCount > xiuCount ? 'Tài' : 'Xỉu';
            let confidence = Math.floor(60 + (ratio - 0.7) * 100);
            let imbalance = Math.abs(taiCount - xiuCount);
            
            return {
                prediction: dominant,
                confidence: Math.min(confidence, 85),
                method: `Cầu nghiêng ${dominant} (${taiCount}T/${xiuCount}X - tỉ lệ ${Math.round(ratio * 100)}%)`,
                score: 3.8
            };
        }
        
        // Check short-term imbalance (5 sessions)
        let last5 = sessions.slice(0, 5);
        let tai5 = last5.filter(s => s.isTai).length;
        let xiu5 = last5.filter(s => s.isXiu).length;
        
        if (Math.abs(tai5 - xiu5) >= 4) {
            let dominant5 = tai5 > xiu5 ? 'Tài' : 'Xỉu';
            return {
                prediction: dominant5,
                confidence: 72,
                method: `Cầu nghiêng ngắn ${dominant5} (${tai5}T/${xiu5}X trong 5 ván)`,
                score: 3.3
            };
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 4: PHÂN TÍCH XÚC XẮC ====================
class DiceAnalysisAlgorithm {
    analyze(sessions) {
        if (sessions.length < 3) return { prediction: null, confidence: 0, method: '' };
        
        let lastSession = sessions[0];
        let dices = lastSession.dices.sort((a, b) => a - b);
        let sum = lastSession.tong;
        
        // Rule 1: 3 con chĩa mũi xuống (số nhỏ)
        let smallDiceCount = dices.filter(d => d <= 3).length;
        if (smallDiceCount >= 2) {
            return {
                prediction: 'Tài',
                confidence: 68,
                method: `3 xúc xắc có ${smallDiceCount} con số nhỏ (≤3) → Lực đẩy lên Tài`,
                score: 2.8
            };
        }
        
        // Rule 2: 3 con số cao
        let bigDiceCount = dices.filter(d => d >= 4).length;
        if (bigDiceCount === 3 && sum >= 15) {
            return {
                prediction: 'Xỉu',
                confidence: 70,
                method: `3 xúc xắc số cao (${dices.join(',')}) tổng ${sum} → Xu hướng hồi Xỉu`,
                score: 3.0
            };
        }
        
        // Rule 3: Tổng điểm cực trị
        if (sum <= 6) {
            return {
                prediction: 'Tài',
                confidence: 75,
                method: `Tổng điểm rất thấp (${sum}) → Xác suất bật lên Tài cao`,
                score: 3.5
            };
        }
        
        if (sum >= 15) {
            return {
                prediction: 'Xỉu',
                confidence: 75,
                method: `Tổng điểm rất cao (${sum}) → Xác suất hồi Xỉu cao`,
                score: 3.5
            };
        }
        
        // Rule 4: Điểm trung bình (9-12)
        if (sum >= 9 && sum <= 12) {
            // Check previous sums for pattern
            if (sessions.length >= 3) {
                let prevSum1 = sessions[1].tong;
                let prevSum2 = sessions[2].tong;
                
                if (prevSum1 >= 9 && prevSum1 <= 12 && prevSum2 >= 9 && prevSum2 <= 12) {
                    return {
                        prediction: sessions[0].isTai ? 'Xỉu' : 'Tài',
                        confidence: 65,
                        method: `Vùng điểm trung bình liên tiếp (${sum}, ${prevSum1}, ${prevSum2}) → Dự đoán đảo chiều`,
                        score: 2.5
                    };
                }
            }
        }
        
        // Rule 5: Có cặp hoặc bão
        let diceMap = {};
        dices.forEach(d => {
            diceMap[d] = (diceMap[d] || 0) + 1;
        });
        
        let maxSame = Math.max(...Object.values(diceMap));
        if (maxSame >= 2) {
            let prediction = maxSame === 3 ? (lastSession.isTai ? 'Xỉu' : 'Tài') : 'Tài';
            let method = maxSame === 3 ? 'Bão 3 con cùng số' : `Cặp ${Object.keys(diceMap).find(k => diceMap[k] === 2)}`;
            
            return {
                prediction: prediction,
                confidence: 70,
                method: `${method} → Thường đảo chiều`,
                score: 3.2
            };
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 5: PHÂN TÍCH DÂY DÀI ====================
class PatternAnalysisAlgorithm {
    analyze(sessions) {
        if (sessions.length < 15) return { prediction: null, confidence: 0, method: '' };
        
        let pattern = [];
        for (let i = 0; i < Math.min(sessions.length, 20); i++) {
            pattern.push(sessions[i].isTai ? 'T' : 'X');
        }
        
        let patternStr = pattern.join('');
        
        // Look for complex patterns
        let predictions = {
            'T': 0,
            'X': 0
        };
        
        // Pattern 1-2-3
        if (patternStr.includes('TXX') || patternStr.includes('XTT')) {
            let lastThree = patternStr.substring(0, 3);
            if (lastThree === 'TXX') predictions['T'] += 2;
            if (lastThree === 'XTT') predictions['X'] += 2;
        }
        
        // Pattern 3-2-1
        if (patternStr.includes('TTX') || patternStr.includes('XXT')) {
            let lastThree = patternStr.substring(0, 3);
            if (lastThree === 'TTX') predictions['X'] += 2;
            if (lastThree === 'XXT') predictions['T'] += 2;
        }
        
        // Check for repetitive sequences
        let sequences = [];
        for (let seqLen = 3; seqLen <= 6; seqLen++) {
            if (patternStr.length >= seqLen * 2) {
                let seq1 = patternStr.substring(0, seqLen);
                let seq2 = patternStr.substring(seqLen, seqLen * 2);
                
                if (seq1 === seq2) {
                    // Pattern repeats!
                    let nextInSeq = seq1[0]; // First of repeating sequence
                    predictions[nextInSeq] += 3;
                    
                    return {
                        prediction: nextInSeq === 'T' ? 'Tài' : 'Xỉu',
                        confidence: 78,
                        method: `Pattern lặp chuỗi ${seqLen} ký tự: ${seq1}`,
                        score: 3.7
                    };
                }
            }
        }
        
        // If no clear winner, return null
        if (predictions['T'] === 0 && predictions['X'] === 0) {
            return { prediction: null, confidence: 0, method: '', score: 0 };
        }
        
        let finalPrediction = predictions['T'] > predictions['X'] ? 'Tài' : 'Xỉu';
        let scoreDiff = Math.abs(predictions['T'] - predictions['X']);
        
        return {
            prediction: finalPrediction,
            confidence: 60 + scoreDiff * 5,
            method: `Phân tích pattern phức hợp (T:${predictions['T']}, X:${predictions['X']})`,
            score: 3.0
        };
    }
}

// ==================== ALGORITHM 6: THUẬT TOÁN XÁC SUẤT ====================
class ProbabilityAlgorithm {
    analyze(sessions) {
        if (sessions.length < 20) return { prediction: null, confidence: 0, method: '' };
        
        let last20 = sessions.slice(0, 20);
        let taiCount = last20.filter(s => s.isTai).length;
        let xiuCount = 20 - taiCount;
        
        // Law of large numbers adjustment
        let expectedRatio = 0.5;
        let currentRatio = taiCount / 20;
        let deviation = Math.abs(currentRatio - expectedRatio);
        
        // If deviation is significant, predict reversion to mean
        if (deviation > 0.15) {
            let prediction = currentRatio > expectedRatio ? 'Xỉu' : 'Tài';
            let confidence = Math.min(75, 50 + deviation * 100);
            
            return {
                prediction: prediction,
                confidence: Math.floor(confidence),
                method: `Định luật số lớn: Tỉ lệ hiện tại ${(currentRatio*100).toFixed(1)}% (${taiCount}T/${xiuCount}X) → Dự báo hồi về trung bình`,
                score: 3.5
            };
        }
        
        // Markov chain analysis
        let transitions = {
            'T->T': 0,
            'T->X': 0,
            'X->X': 0,
            'X->T': 0
        };
        
        for (let i = 0; i < last20.length - 1; i++) {
            let from = last20[i].isTai ? 'T' : 'X';
            let to = last20[i + 1].isTai ? 'T' : 'X';
            transitions[`${from}->${to}`]++;
        }
        
        let lastIsTai = last20[0].isTai;
        let sameTransitions = lastIsTai ? transitions['T->T'] : transitions['X->X'];
        let differentTransitions = lastIsTai ? transitions['T->X'] : transitions['X->T'];
        
        let total = sameTransitions + differentTransitions;
        if (total > 0) {
            let probabilitySame = sameTransitions / total;
            
            if (probabilitySame > 0.6) {
                return {
                    prediction: lastIsTai ? 'Tài' : 'Xỉu',
                    confidence: Math.floor(probabilitySame * 100 * 0.8),
                    method: `Xích Markov: Xác suất giữ nguyên ${(probabilitySame*100).toFixed(1)}%`,
                    score: 3.2
                };
            } else if (probabilitySame < 0.4) {
                return {
                    prediction: lastIsTai ? 'Xỉu' : 'Tài',
                    confidence: Math.floor((1 - probabilitySame) * 100 * 0.8),
                    method: `Xích Markov: Xác suất đảo chiều ${((1-probabilitySame)*100).toFixed(1)}%`,
                    score: 3.2
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 7: THUẬT TOÁN TỔNG HỢP NÂNG CAO ====================
class AdvancedCompositeAlgorithm {
    analyze(sessions) {
        if (sessions.length < 10) return { prediction: null, confidence: 0, method: '' };
        
        let results = [];
        let methods = [];
        
        // 1. Analyze dice sum trends
        let last5Sums = sessions.slice(0, 5).map(s => s.tong);
        let sumAvg = last5Sums.reduce((a, b) => a + b, 0) / 5;
        let sumTrend = last5Sums[0] - last5Sums[4];
        
        if (sumAvg < 8.5) {
            results.push('Tài');
            methods.push('Trung bình tổng thấp (≤8.5)');
        } else if (sumAvg > 12.5) {
            results.push('Xỉu');
            methods.push('Trung bình tổng cao (≥12.5)');
        }
        
        // 2. Analyze consecutive same results
        let consecutiveSame = 1;
        for (let i = 1; i < Math.min(sessions.length, 8); i++) {
            if (sessions[i].isTai === sessions[0].isTai) {
                consecutiveSame++;
            } else {
                break;
            }
        }
        
        if (consecutiveSame >= 4) {
            results.push(sessions[0].isTai ? 'Xỉu' : 'Tài');
            methods.push(`Bẻ cầu sau ${consecutiveSame} ván ${sessions[0].isTai ? 'Tài' : 'Xỉu'}`);
        }
        
        // 3. Analyze time-based patterns (simulated)
        let hour = new Date().getHours();
        if ((hour >= 19 && hour <= 23) || (hour >= 0 && hour <= 4)) {
            // High traffic hours - favor 1-1 patterns
            if (sessions.length >= 3) {
                let isAlternating = true;
                for (let i = 0; i < 2; i++) {
                    if (sessions[i].isTai === sessions[i + 1].isTai) {
                        isAlternating = false;
                        break;
                    }
                }
                
                if (isAlternating) {
                    results.push(sessions[0].isTai ? 'Xỉu' : 'Tài');
                    methods.push('Giờ cao điểm - theo cầu 1-1');
                }
            }
        } else {
            // Low traffic hours - favor streaks
            if (consecutiveSame >= 3) {
                results.push(sessions[0].isTai ? 'Tài' : 'Xỉu');
                methods.push('Giờ thấp điểm - bám cầu bệt');
            }
        }
        
        // 4. Count results
        let taiVotes = results.filter(r => r === 'Tài').length;
        let xiuVotes = results.filter(r => r === 'Xỉu').length;
        
        if (taiVotes === 0 && xiuVotes === 0) {
            return { prediction: null, confidence: 0, method: '', score: 0 };
        }
        
        let prediction = taiVotes > xiuVotes ? 'Tài' : 'Xỉu';
        let confidence = Math.min(80, 50 + Math.abs(taiVotes - xiuVotes) * 15);
        let methodStr = methods.join(' | ');
        
        return {
            prediction: prediction,
            confidence: confidence,
            method: `Tổng hợp nâng cao: ${methodStr}`,
            score: 3.8
        };
    }
}

// ==================== ALGORITHM 8: PHÂN TÍCH ĐỘ LỆCH ====================
class DeviationAnalysisAlgorithm {
    analyze(sessions) {
        if (sessions.length < 25) return { prediction: null, confidence: 0, method: '' };
        
        let taiCount = 0;
        let xiuCount = 0;
        let sums = [];
        
        // Analyze last 25 sessions
        for (let i = 0; i < Math.min(sessions.length, 25); i++) {
            if (sessions[i].isTai) taiCount++;
            else xiuCount++;
            sums.push(sessions[i].tong);
        }
        
        let total = taiCount + xiuCount;
        let taiRatio = taiCount / total;
        let xiuRatio = xiuCount / total;
        
        // Calculate standard deviation of sums
        let sumAvg = sums.reduce((a, b) => a + b, 0) / sums.length;
        let variance = sums.reduce((a, b) => a + Math.pow(b - sumAvg, 2), 0) / sums.length;
        let stdDev = Math.sqrt(variance);
        
        // If results are highly skewed
        if (Math.abs(taiRatio - 0.5) > 0.2) {
            let prediction = taiRatio > 0.5 ? 'Xỉu' : 'Tài';
            let skewAmount = Math.abs(taiRatio - 0.5);
            
            return {
                prediction: prediction,
                confidence: Math.min(85, 60 + skewAmount * 100),
                method: `Độ lệch cao: ${(taiRatio*100).toFixed(1)}% Tài → Dự báo điều chỉnh`,
                score: 4.0
            };
        }
        
        // If sums have low variance (stuck in middle range)
        if (stdDev < 3.0 && sums.length >= 15) {
            let middleCount = sums.filter(s => s >= 9 && s <= 12).length;
            let middleRatio = middleCount / sums.length;
            
            if (middleRatio > 0.6) {
                // Been in middle too long, predict breakout
                let prediction = sumAvg <= 10.5 ? 'Tài' : 'Xỉu';
                
                return {
                    prediction: prediction,
                    confidence: 70,
                    method: `Biến động thấp (σ=${stdDev.toFixed(1)}) - ${middleRatio.toFixed(1)*100}% ở giữa → Dự báo bứt phá`,
                    score: 3.5
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 9: PHÂN TÍCH CHU KỲ ====================
class CycleAnalysisAlgorithm {
    analyze(sessions) {
        if (sessions.length < 30) return { prediction: null, confidence: 0, method: '' };
        
        let pattern = [];
        for (let i = 0; i < Math.min(sessions.length, 30); i++) {
            pattern.push(sessions[i].isTai ? 1 : 0);
        }
        
        // Try to find cycles of length 3-10
        let bestCycle = null;
        let bestMatch = 0;
        
        for (let cycleLen = 3; cycleLen <= 10; cycleLen++) {
            if (pattern.length >= cycleLen * 2) {
                let matchCount = 0;
                let totalComparisons = 0;
                
                for (let i = 0; i < pattern.length - cycleLen; i++) {
                    if (pattern[i] === pattern[i + cycleLen]) {
                        matchCount++;
                    }
                    totalComparisons++;
                }
                
                let matchRatio = totalComparisons > 0 ? matchCount / totalComparisons : 0;
                
                if (matchRatio > 0.7 && matchRatio > bestMatch) {
                    bestMatch = matchRatio;
                    bestCycle = cycleLen;
                }
            }
        }
        
        if (bestCycle) {
            // Predict based on cycle
            let cyclePosition = pattern.length % bestCycle;
            let predictedValue = pattern[cyclePosition];
            
            return {
                prediction: predictedValue === 1 ? 'Tài' : 'Xỉu',
                confidence: Math.min(85, Math.floor(bestMatch * 100 * 0.9)),
                method: `Chu kỳ ${bestCycle} ván (độ khớp ${(bestMatch*100).toFixed(1)}%)`,
                score: 4.2
            };
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 10: MACHINE LEARNING SIMULATION ====================
class MLSimulationAlgorithm {
    analyze(sessions) {
        if (sessions.length < 40) return { prediction: null, confidence: 0, method: '' };
        
        // Extract features
        let features = [];
        for (let i = 0; i < Math.min(sessions.length, 40); i++) {
            let session = sessions[i];
            features.push({
                d1: session.xuc_xac_1,
                d2: session.xuc_xac_2,
                d3: session.xuc_xac_3,
                sum: session.tong,
                isTai: session.isTai ? 1 : 0,
                isXiu: session.isXiu ? 1 : 0,
                hasPair: this.hasPair(session.dices) ? 1 : 0,
                hasTriple: this.hasTriple(session.dices) ? 1 : 0,
                sumCategory: this.getSumCategory(session.tong)
            });
        }
        
        // Simple neural network simulation (weighted voting)
        let weights = {
            recentBias: 0.3,
            sumTrend: 0.25,
            patternRecognition: 0.25,
            statisticalBias: 0.2
        };
        
        // 1. Recent bias (last 5 sessions)
        let recentTai = 0;
        for (let i = 0; i < Math.min(5, features.length); i++) {
            recentTai += features[i].isTai;
        }
        let recentBias = recentTai / Math.min(5, features.length);
        
        // 2. Sum trend
        let recentSums = features.slice(0, 5).map(f => f.sum);
        let sumTrend = recentSums[0] - recentSums[recentSums.length - 1];
        let sumBias = sumTrend > 0 ? 0.6 : 0.4;
        
        // 3. Pattern recognition (simple)
        let patternScore = 0;
        if (features.length >= 10) {
            let last10 = features.slice(0, 10).map(f => f.isTai);
            let transitions = 0;
            for (let i = 0; i < 9; i++) {
                if (last10[i] !== last10[i + 1]) transitions++;
            }
            patternScore = transitions / 9;
        }
        
        // 4. Statistical bias (overall)
        let totalTai = features.reduce((sum, f) => sum + f.isTai, 0);
        let statisticalBias = totalTai / features.length;
        
        // Combine predictions
        let taiProbability = 
            (recentBias * weights.recentBias) +
            (sumBias * weights.sumTrend) +
            (patternScore * weights.patternRecognition) +
            (statisticalBias * weights.statisticalBias);
        
        taiProbability = taiProbability / 
            (weights.recentBias + weights.sumTrend + 
             weights.patternRecognition + weights.statisticalBias);
        
        let prediction = taiProbability > 0.5 ? 'Tài' : 'Xỉu';
        let confidence = Math.abs(taiProbability - 0.5) * 200;
        
        return {
            prediction: prediction,
            confidence: Math.min(90, Math.floor(confidence)),
            method: `Mô phỏng ML: P(Tài)=${taiProbability.toFixed(3)}, Các trọng số ${JSON.stringify(weights)}`,
            score: 4.5
        };
    }
    
    hasPair(dices) {
        return new Set(dices).size === 2;
    }
    
    hasTriple(dices) {
        return new Set(dices).size === 1;
    }
    
    getSumCategory(sum) {
        if (sum <= 6) return 0;
        if (sum <= 10) return 1;
        if (sum <= 15) return 2;
        return 3;
    }
}

// ==================== MAIN ANALYZER ====================
class TaiXiuAnalyzer {
    constructor() {
        this.algorithms = [
            new CauBetAlgorithm(),          // Algorithm 1
            new CauDaoAlgorithm(),          // Algorithm 2
            new CauNghiengAlgorithm(),      // Algorithm 3
            new DiceAnalysisAlgorithm(),    // Algorithm 4
            new PatternAnalysisAlgorithm(), // Algorithm 5
            new ProbabilityAlgorithm(),     // Algorithm 6
            new AdvancedCompositeAlgorithm(), // Algorithm 7
            new DeviationAnalysisAlgorithm(), // Algorithm 8
            new CycleAnalysisAlgorithm(),   // Algorithm 9
            new MLSimulationAlgorithm()     // Algorithm 10
        ];
        
        this.algorithmWeights = [1.0, 0.9, 1.1, 0.8, 1.2, 1.0, 1.3, 1.1, 1.4, 1.5];
    }
    
    analyze(sessions) {
        let results = [];
        let allMethods = [];
        let usedAlgorithms = 0;
        
        // Run all algorithms
        for (let i = 0; i < this.algorithms.length; i++) {
            let result = this.algorithms[i].analyze(sessions);
            if (result.prediction) {
                result.algorithmId = i + 1;
                result.weightedScore = result.score * this.algorithmWeights[i];
                results.push(result);
                allMethods.push(`A${i+1}: ${result.method}`);
                usedAlgorithms++;
            }
        }
        
        if (results.length === 0) {
            // Fallback prediction
            let lastSession = sessions[0];
            let fallbackPrediction = lastSession.isTai ? 'Xỉu' : 'Tài';
            
            return new AnalysisResult({
                du_doan: fallbackPrediction,
                do_tin_cay: '55%',
                do_manh: 'YẾU',
                phuong_phap: 'Dự đoán ngược theo quán tính (không đủ dữ liệu)',
                thong_tin_bo_sung: {
                    thuat_toan_su_dung: 1,
                    patterns_da_tai: 0,
                    diem_so: {
                        totalAlgorithms: 10,
                        agreeingAlgorithms: 1,
                        taiScore: fallbackPrediction === 'Tài' ? '1.00' : '0.00',
                        xiuScore: fallbackPrediction === 'Xỉu' ? '1.00' : '0.00',
                        scoreDifference: '1.00',
                        agreementRatio: 10
                    },
                    xuc_xac_cuoi: sessions[0]?.dices || [0,0,0]
                }
            });
        }
        
        // Calculate aggregated prediction
        let taiTotal = 0;
        let xiuTotal = 0;
        let totalWeight = 0;
        
        results.forEach(result => {
            let weight = result.weightedScore;
            totalWeight += weight;
            
            if (result.prediction === 'Tài') {
                taiTotal += weight * (result.confidence / 100);
            } else {
                xiuTotal += weight * (result.confidence / 100);
            }
        });
        
        let taiScore = (taiTotal / totalWeight).toFixed(2);
        let xiuScore = (xiuTotal / totalWeight).toFixed(2);
        let scoreDifference = Math.abs(taiTotal - xiuTotal).toFixed(2);
        
        let finalPrediction = taiTotal > xiuTotal ? 'Tài' : 'Xỉu';
        let confidence = Math.max(taiTotal, xiuTotal) * 100;
        let agreementRatio = Math.round((results.filter(r => r.prediction === finalPrediction).length / results.length) * 100);
        
        // Determine strength
        let strength = 'TRUNG BÌNH';
        if (confidence >= 80) strength = 'RẤT MẠNH';
        else if (confidence >= 70) strength = 'MẠNH';
        else if (confidence >= 60) strength = 'KHÁ';
        else strength = 'YẾU';
        
        // Build method string
        let methodStr = '';
        let topResults = results.sort((a, b) => b.weightedScore - a.weightedScore).slice(0, 3);
        topResults.forEach((r, idx) => {
            methodStr += `${idx > 0 ? ' | ' : ''}${r.method}`;
        });
        
        let result = new AnalysisResult();
        result.du_doan = finalPrediction;
        result.do_tin_cay = `${Math.round(confidence)}%`;
        result.do_manh = strength;
        result.phuong_phap = methodStr;
        result.thong_tin_bo_sung.thuat_toan_su_dung = usedAlgorithms;
        result.thong_tin_bo_sung.patterns_da_tai = results.length;
        result.thong_tin_bo_sung.diem_so.totalAlgorithms = 10;
        result.thong_tin_bo_sung.diem_so.agreeingAlgorithms = results.filter(r => r.prediction === finalPrediction).length;
        result.thong_tin_bo_sung.diem_so.taiScore = taiScore;
        result.thong_tin_bo_sung.diem_so.xiuScore = xiuScore;
        result.thong_tin_bo_sung.diem_so.scoreDifference = scoreDifference;
        result.thong_tin_bo_sung.diem_so.agreementRatio = agreementRatio;
        result.thong_tin_bo_sung.xuc_xac_cuoi = sessions[0]?.dices || [0,0,0];
        
        return result;
    }
}

// ==================== API FETCHERS ====================
async function fetchSunwinData() {
    try {
        const response = await axios.get(API_CONFIG.SUNWIN, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.data && Array.isArray(response.data)) {
            return response.data.map(item => new SessionData(
                item.phien,
                item.xuc_xac_1,
                item.xuc_xac_2,
                item.xuc_xac_3,
                item.tong,
                item.ket_qua
            ));
        }
        return [];
    } catch (error) {
        console.error('Sunwin API error:', error.message);
        return [];
    }
}

async function fetchLC79Data() {
    try {
        const response = await axios.get(API_CONFIG.LC79, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        
        if (response.data && response.data.list && Array.isArray(response.data.list)) {
            return response.data.list.map(item => new SessionData(
                item.id,
                item.dices[0],
                item.dices[1],
                item.dices[2],
                item.point,
                item.resultTruyenThong
            ));
        }
        return [];
    } catch (error) {
        console.error('LC79 API error:', error.message);
        return [];
    }
}

// ==================== API ROUTES ====================
app.get('/sunwin', async (req, res) => {
    try {
        const sessions = await fetchSunwinData();
        
        if (sessions.length === 0) {
            return res.json({
                success: false,
                error: 'Không lấy được dữ liệu từ Sunwin'
            });
        }
        
        const analyzer = new TaiXiuAnalyzer();
        const analysis = analyzer.analyze(sessions);
        
        const lastSession = sessions[0];
        const response = {
            success: true,
            data: {
                previous_session: {
                    phien: lastSession.phien,
                    xuc_xac_1: lastSession.xuc_xac_1,
                    xuc_xac_2: lastSession.xuc_xac_2,
                    xuc_xac_3: lastSession.xuc_xac_3,
                    tong: lastSession.tong,
                    ket_qua: lastSession.ket_qua
                },
                current_session: lastSession.phien,
                next_session: lastSession.phien + 1,
                du_doan: analysis.du_doan,
                do_tin_cay: analysis.do_tin_cay,
                do_manh: analysis.do_manh,
                phuong_phap: analysis.phuong_phap,
                thong_tin_bo_sung: analysis.thong_tin_bo_sung
            }
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('Sunwin route error:', error);
        res.json({
            success: false,
            error: 'Lỗi server: ' + error.message
        });
    }
});

app.get('/lc79', async (req, res) => {
    try {
        const sessions = await fetchLC79Data();
        
        if (sessions.length === 0) {
            return res.json({
                success: false,
                error: 'Không lấy được dữ liệu từ LC79'
            });
        }
        
        const analyzer = new TaiXiuAnalyzer();
        const analysis = analyzer.analyze(sessions);
        
        const lastSession = sessions[0];
        const response = {
            success: true,
            data: {
                previous_session: {
                    phien: lastSession.phien,
                    xuc_xac_1: lastSession.xuc_xac_1,
                    xuc_xac_2: lastSession.xuc_xac_2,
                    xuc_xac_3: lastSession.xuc_xac_3,
                    tong: lastSession.tong,
                    ket_qua: lastSession.ket_qua
                },
                current_session: lastSession.phien,
                next_session: lastSession.phien + 1,
                du_doan: analysis.du_doan,
                do_tin_cay: analysis.do_tin_cay,
                do_manh: analysis.do_manh,
                phuong_phap: analysis.phuong_phap,
                thong_tin_bo_sung: analysis.thong_tin_bo_sung
            }
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('LC79 route error:', error);
        res.json({
            success: false,
            error: 'Lỗi server: ' + error.message
        });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'CUONGDEVGPT Tai Xiu Prediction API',
        version: '2.0.0',
        endpoints: ['/sunwin', '/lc79'],
        creator: 'Big dad Cuongdepzaivcl',
        algorithms: 10,
        message: 'API đang hoạt động bình thường! 🚀'
    });
});

app.get('/status', async (req, res) => {
    const sunwinData = await fetchSunwinData();
    const lc79Data = await fetchLC79Data();
    
    res.json({
        sunwin: {
            status: sunwinData.length > 0 ? 'online' : 'offline',
            sessions: sunwinData.length,
            last_session: sunwinData[0] || null
        },
        lc79: {
            status: lc79Data.length > 0 ? 'online' : 'offline',
            sessions: lc79Data.length,
            last_session: lc79Data[0] || null
        },
        server_time: new Date().toISOString(),
        memory_usage: process.memoryUsage()
    });
});

// ==================== AUTO REFRESH SYSTEM ====================
class AutoRefreshSystem {
    constructor() {
        this.sunwinCache = [];
        this.lc79Cache = [];
        this.lastUpdate = {};
        this.cacheDuration = 10000; // 10 seconds
        
        // Start auto-refresh
        this.startAutoRefresh();
    }
    
    async refreshSunwin() {
        try {
            this.sunwinCache = await fetchSunwinData();
            this.lastUpdate.sunwin = new Date();
            console.log(`[${new Date().toISOString()}] Sunwin cache refreshed: ${this.sunwinCache.length} sessions`);
        } catch (error) {
            console.error('Auto-refresh Sunwin failed:', error.message);
        }
    }
    
    async refreshLC79() {
        try {
            this.lc79Cache = await fetchLC79Data();
            this.lastUpdate.lc79 = new Date();
            console.log(`[${new Date().toISOString()}] LC79 cache refreshed: ${this.lc79Cache.length} sessions`);
        } catch (error) {
            console.error('Auto-refresh LC79 failed:', error.message);
        }
    }
    
    startAutoRefresh() {
        // Initial refresh
        this.refreshSunwin();
        this.refreshLC79();
        
        // Set interval for auto-refresh
        setInterval(() => {
            this.refreshSunwin();
            this.refreshLC79();
        }, this.cacheDuration);
        
        console.log('Auto-refresh system started! 🔄');
    }
    
    getSunwinData() {
        return this.sunwinCache;
    }
    
    getLC79Data() {
        return this.lc79Cache;
    }
}

// ==================== CACHED API ROUTES ====================
const refreshSystem = new AutoRefreshSystem();

app.get('/sunwin/cached', async (req, res) => {
    try {
        const sessions = refreshSystem.getSunwinData();
        
        if (sessions.length === 0) {
            return res.json({
                success: false,
                error: 'Cache chưa sẵn sàng, vui lòng thử lại sau'
            });
        }
        
        const analyzer = new TaiXiuAnalyzer();
        const analysis = analyzer.analyze(sessions);
        
        const lastSession = sessions[0];
        const response = {
            success: true,
            data: {
                previous_session: {
                    phien: lastSession.phien,
                    xuc_xac_1: lastSession.xuc_xac_1,
                    xuc_xac_2: lastSession.xuc_xac_2,
                    xuc_xac_3: lastSession.xuc_xac_3,
                    tong: lastSession.tong,
                    ket_qua: lastSession.ket_qua
                },
                current_session: lastSession.phien,
                next_session: lastSession.phien + 1,
                du_doan: analysis.du_doan,
                do_tin_cay: analysis.do_tin_cay,
                do_manh: analysis.do_manh,
                phuong_phap: analysis.phuong_phap,
                thong_tin_bo_sung: analysis.thong_tin_bo_sung
            },
            cached: true,
            last_updated: refreshSystem.lastUpdate.sunwin
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('Sunwin cached route error:', error);
        res.json({
            success: false,
            error: 'Lỗi server: ' + error.message
        });
    }
});

app.get('/lc79/cached', async (req, res) => {
    try {
        const sessions = refreshSystem.getLC79Data();
        
        if (sessions.length === 0) {
            return res.json({
                success: false,
                error: 'Cache chưa sẵn sàng, vui lòng thử lại sau'
            });
        }
        
        const analyzer = new TaiXiuAnalyzer();
        const analysis = analyzer.analyze(sessions);
        
        const lastSession = sessions[0];
        const response = {
            success: true,
            data: {
                previous_session: {
                    phien: lastSession.phien,
                    xuc_xac_1: lastSession.xuc_xac_1,
                    xuc_xac_2: lastSession.xuc_xac_2,
                    xuc_xac_3: lastSession.xuc_xac_3,
                    tong: lastSession.tong,
                    ket_qua: lastSession.ket_qua
                },
                current_session: lastSession.phien,
                next_session: lastSession.phien + 1,
                du_doan: analysis.du_doan,
                do_tin_cay: analysis.do_tin_cay,
                do_manh: analysis.do_manh,
                phuong_phap: analysis.phuong_phap,
                thong_tin_bo_sung: analysis.thong_tin_bo_sung
            },
            cached: true,
            last_updated: refreshSystem.lastUpdate.lc79
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('LC79 cached route error:', error);
        res.json({
            success: false,
            error: 'Lỗi server: ' + error.message
        });
    }
});

// ==================== START SERVER ====================
app.listen(port, () => {
    console.log(`=========================================`);
    console.log(`🚀 CUONGDEVGPT Tai Xiu API đang chạy!`);
    console.log(`📍 Port: ${port}`);
    console.log(`👑 Creator: Big dad Cuongdepzaivcl`);
    console.log(`🔢 Algorithms: 10 thuật toán mạnh nhất`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log(`=========================================`);
    console.log(`📊 Endpoints:`);
    console.log(`   GET /          - Health check`);
    console.log(`   GET /status    - System status`);
    console.log(`   GET /sunwin    - Dự đoán Sunwin (real-time)`);
    console.log(`   GET /lc79      - Dự đoán LC79 (real-time)`);
    console.log(`   GET /sunwin/cached - Dự đoán Sunwin (cached)`);
    console.log(`   GET /lc79/cached   - Dự đoán LC79 (cached)`);
    console.log(`=========================================`);
});

// ==================== ERROR HANDLING ====================
process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// ==================== EXPORTS FOR TESTING ====================
module.exports = {
    app,
    TaiXiuAnalyzer,
    SessionData,
    AnalysisResult,
    AutoRefreshSystem
};

// #Wormgpt Cường Dev Don't Delete for copyright|