// server.js - CUONGDEVGPT AI TAI XIU SUPER BOT v2.0 - BÁM CẦU MẠNH
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
        this.phien = parseInt(phien);
        this.xuc_xac_1 = parseInt(xuc_xac_1);
        this.xuc_xac_2 = parseInt(xuc_xac_2);
        this.xuc_xac_3 = parseInt(xuc_xac_3);
        this.tong = parseInt(tong);
        this.ket_qua = this.normalizeResult(ket_qua);
        this.dices = [this.xuc_xac_1, this.xuc_xac_2, this.xuc_xac_3];
        this.isTai = this.ket_qua === 'TAI' || this.ket_qua === 'TÀI';
        this.isXiu = this.ket_qua === 'XIU' || this.ket_qua === 'XỈU';
    }
    
    normalizeResult(result) {
        if (!result) return '';
        return result.toString()
            .trim()
            .toUpperCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace('TÀI', 'TAI')
            .replace('XỈU', 'XIU');
    }
    
    validate() {
        // Validate dice values (1-6)
        for (let dice of this.dices) {
            if (dice < 1 || dice > 6) return false;
        }
        
        // Validate sum
        const calculatedSum = this.xuc_xac_1 + this.xuc_xac_2 + this.xuc_xac_3;
        if (calculatedSum !== this.tong) return false;
        
        // Validate result matches sum
        const expectedResult = this.tong >= 11 ? 'TAI' : 'XIU';
        if (this.ket_qua !== expectedResult && this.ket_qua !== 'TÀI' && this.ket_qua !== 'XỈU') return false;
        
        return true;
    }
}

class AnalysisResult {
    constructor(data = {}) {
        this.du_doan = data.du_doan || 'Xỉu';
        this.do_tin_cay = data.do_tin_cay || '50%';
        this.do_manh = data.do_manh || 'TRUNG BÌNH';
        this.phuong_phap = data.phuong_phap || 'Đang phân tích...';
        this.thong_tin_bo_sung = data.thong_tin_bo_sung || {
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

// ==================== ALGORITHM 0: CẦU BÁM MẠNH (ƯU TIÊN CAO) ====================
class CauBamAlgorithm {
    analyze(sessions) {
        if (sessions.length < 3) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        // Phân tích streak hiện tại
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
        
        // LUẬT BÁM CẦU MẠNH: streak >= 3 thì BÁM THEO CẦU
        if (streakCount >= 3) {
            let confidence = Math.min(90, 55 + streakCount * 8);
            return {
                prediction: currentType,
                confidence: confidence,
                method: `BÁM CẦU ${currentType} mạnh (${streakCount} ván liên tiếp)`,
                score: 4.8
            };
        }
        
        // Nếu chưa có streak đủ mạnh, phân tích xu hướng 5 ván gần nhất
        if (sessions.length >= 5) {
            let last5 = sessions.slice(0, 5);
            let taiCount = last5.filter(s => s.isTai).length;
            let xiuCount = last5.filter(s => s.isXiu).length;
            
            if (taiCount >= 4) {
                return {
                    prediction: 'Tài',
                    confidence: 75,
                    method: 'Bám xu hướng Tài (4/5 ván gần nhất)',
                    score: 4.0
                };
            }
            
            if (xiuCount >= 4) {
                return {
                    prediction: 'Xỉu',
                    confidence: 75,
                    method: 'Bám xu hướng Xỉu (4/5 ván gần nhất)',
                    score: 4.0
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 1: CẦU BỆT DÀI (SỬA BÁM CẦU) ====================
class CauBetAlgorithm {
    analyze(sessions) {
        if (sessions.length < 3) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        // Phân tích streak
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
        
        // SỬA: streak >= 3 thì BÁM CẦU (trước chỉ bệt 4-5)
        if (streakCount >= 3) {
            let confidence = Math.min(85, 60 + streakCount * 7);
            return {
                prediction: currentType,
                confidence: confidence,
                method: `Cầu bệt ${currentType} ${streakCount} ván (bám cầu)`,
                score: 4.2
            };
        }
        
        // Check 5 ván cùng loại
        if (sessions.length >= 5) {
            let last5 = sessions.slice(0, 5);
            let allTai = last5.every(s => s.isTai);
            let allXiu = last5.every(s => s.isXiu);
            
            if (allTai) {
                return {
                    prediction: 'Tài',
                    confidence: 80,
                    method: 'Cầu bệt Tài 5 ván liên tiếp',
                    score: 4.5
                };
            }
            
            if (allXiu) {
                return {
                    prediction: 'Xỉu',
                    confidence: 80,
                    method: 'Cầu bệt Xỉu 5 ván liên tiếp',
                    score: 4.5
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 2: CẦU ĐẢO 1-1 ====================
class CauDaoAlgorithm {
    analyze(sessions) {
        if (sessions.length < 4) return { prediction: null, confidence: 0, method: '', score: 0 };
        
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
            let confidence = 70 + (pattern.length - 3) * 5;
            
            return {
                prediction: prediction,
                confidence: Math.min(confidence, 85),
                method: `Cầu đảo 1-1 (${pattern.join('-')})`,
                score: 3.8
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
                    confidence: 75,
                    method: `Cầu đôi 2-2 (${pattern.slice(0, 4).join('')})`,
                    score: 3.5
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 3: CẦU NGHIÊNG ====================
class CauNghiengAlgorithm {
    analyze(sessions) {
        if (sessions.length < 8) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        let last10 = sessions.slice(0, 10);
        let taiCount = last10.filter(s => s.isTai).length;
        let xiuCount = last10.filter(s => s.isXiu).length;
        
        let ratio = Math.max(taiCount, xiuCount) / 10;
        
        if (ratio >= 0.7) {
            let dominant = taiCount > xiuCount ? 'Tài' : 'Xỉu';
            let confidence = Math.floor(65 + (ratio - 0.7) * 100);
            let imbalance = Math.abs(taiCount - xiuCount);
            
            return {
                prediction: dominant,
                confidence: Math.min(confidence, 88),
                method: `Cầu nghiêng ${dominant} (${taiCount}T/${xiuCount}X - tỉ lệ ${Math.round(ratio * 100)}%)`,
                score: 4.0
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
                confidence: 78,
                method: `Cầu nghiêng ngắn ${dominant5} (${tai5}T/${xiu5}X trong 5 ván)`,
                score: 3.8
            };
        }
        
        // Bám đa số 8 ván gần nhất
        if (sessions.length >= 8) {
            let last8 = sessions.slice(0, 8);
            let tai8 = last8.filter(s => s.isTai).length;
            let xiu8 = last8.filter(s => s.isXiu).length;
            
            if (tai8 > xiu8) {
                return {
                    prediction: 'Tài',
                    confidence: 68,
                    method: `Bám đa số Tài (${tai8}T/${xiu8}X 8 ván)`,
                    score: 3.5
                };
            } else if (xiu8 > tai8) {
                return {
                    prediction: 'Xỉu',
                    confidence: 68,
                    method: `Bám đa số Xỉu (${tai8}T/${xiu8}X 8 ván)`,
                    score: 3.5
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 4: PHÂN TÍCH XÚC XẮC ====================
class DiceAnalysisAlgorithm {
    analyze(sessions) {
        if (sessions.length < 3) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        let lastSession = sessions[0];
        let dices = lastSession.dices.sort((a, b) => a - b);
        let sum = lastSession.tong;
        
        // Rule 1: 3 con chĩa mũi xuống (số nhỏ) -> TĂNG Tài
        let smallDiceCount = dices.filter(d => d <= 3).length;
        if (smallDiceCount >= 2) {
            return {
                prediction: 'Tài',
                confidence: 72,
                method: `Xúc xắc có ${smallDiceCount} con số nhỏ (≤3) → Lực đẩy Tài`,
                score: 3.5
            };
        }
        
        // Rule 2: 3 con số cao -> TĂNG Xỉu
        let bigDiceCount = dices.filter(d => d >= 4).length;
        if (bigDiceCount === 3 && sum >= 15) {
            return {
                prediction: 'Xỉu',
                confidence: 75,
                method: `3 xúc xắc số cao (${dices.join(',')}) tổng ${sum} → Hồi Xỉu`,
                score: 3.8
            };
        }
        
        // Rule 3: Tổng điểm cực trị -> BÁM XU HƯỚNG ĐẢO
        if (sum <= 6) {
            return {
                prediction: 'Tài',
                confidence: 78,
                method: `Tổng điểm rất thấp (${sum}) → Bật Tài mạnh`,
                score: 4.0
            };
        }
        
        if (sum >= 15) {
            return {
                prediction: 'Xỉu',
                confidence: 78,
                method: `Tổng điểm rất cao (${sum}) → Hồi Xỉu mạnh`,
                score: 4.0
            };
        }
        
        // Rule 4: Có cặp hoặc bão -> BÁM ĐẢO CHIỀU
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
                confidence: 75,
                method: `${method} → Bám đảo chiều`,
                score: 3.8
            };
        }
        
        // Rule 5: Tổng 7-10 nghiêng Tài, 11-14 nghiêng Xỉu
        if (sum >= 7 && sum <= 10) {
            return {
                prediction: 'Tài',
                confidence: 65,
                method: `Tổng ${sum} trong vùng nghiêng Tài (7-10)`,
                score: 3.0
            };
        }
        
        if (sum >= 11 && sum <= 14) {
            return {
                prediction: 'Xỉu',
                confidence: 65,
                method: `Tổng ${sum} trong vùng nghiêng Xỉu (11-14)`,
                score: 3.0
            };
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 5: PHÂN TÍCH DÂY DÀI ====================
class PatternAnalysisAlgorithm {
    analyze(sessions) {
        if (sessions.length < 10) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        let pattern = [];
        for (let i = 0; i < Math.min(sessions.length, 15); i++) {
            pattern.push(sessions[i].isTai ? 'T' : 'X');
        }
        
        let patternStr = pattern.join('');
        
        // Look for complex patterns
        let predictions = {
            'T': 0,
            'X': 0
        };
        
        // Pattern phổ biến: TXX, XTT (báo đảo)
        if (patternStr.includes('TXX') || patternStr.includes('XTT')) {
            let lastThree = patternStr.substring(0, 3);
            if (lastThree === 'TXX') {
                predictions['T'] += 3;
                return {
                    prediction: 'Tài',
                    confidence: 80,
                    method: `Pattern TXX → báo Tài tiếp theo`,
                    score: 4.2
                };
            }
            if (lastThree === 'XTT') {
                predictions['X'] += 3;
                return {
                    prediction: 'Xỉu',
                    confidence: 80,
                    method: `Pattern XTT → báo Xỉu tiếp theo`,
                    score: 4.2
                };
            }
        }
        
        // Pattern: TTX, XXT (báo đảo)
        if (patternStr.includes('TTX') || patternStr.includes('XXT')) {
            let lastThree = patternStr.substring(0, 3);
            if (lastThree === 'TTX') {
                predictions['X'] += 3;
                return {
                    prediction: 'Xỉu',
                    confidence: 80,
                    method: `Pattern TTX → báo Xỉu tiếp theo`,
                    score: 4.2
                };
            }
            if (lastThree === 'XXT') {
                predictions['T'] += 3;
                return {
                    prediction: 'Tài',
                    confidence: 80,
                    method: `Pattern XXT → báo Tài tiếp theo`,
                    score: 4.2
                };
            }
        }
        
        // Check for repetitive sequences
        for (let seqLen = 3; seqLen <= 5; seqLen++) {
            if (patternStr.length >= seqLen * 2) {
                let seq1 = patternStr.substring(0, seqLen);
                let seq2 = patternStr.substring(seqLen, seqLen * 2);
                
                if (seq1 === seq2) {
                    // Pattern repeats!
                    let nextInSeq = seq1[0];
                    return {
                        prediction: nextInSeq === 'T' ? 'Tài' : 'Xỉu',
                        confidence: 85,
                        method: `Pattern lặp chuỗi ${seqLen} ký tự: ${seq1}`,
                        score: 4.5
                    };
                }
            }
        }
        
        // Phân tích đa số trong 10 ván
        if (sessions.length >= 10) {
            let last10 = sessions.slice(0, 10);
            let tai10 = last10.filter(s => s.isTai).length;
            let xiu10 = last10.filter(s => s.isXiu).length;
            
            if (tai10 >= 7) {
                return {
                    prediction: 'Tài',
                    confidence: 75,
                    method: `Đa số Tài trong 10 ván (${tai10}T/${xiu10}X)`,
                    score: 3.8
                };
            }
            
            if (xiu10 >= 7) {
                return {
                    prediction: 'Xỉu',
                    confidence: 75,
                    method: `Đa số Xỉu trong 10 ván (${tai10}T/${xiu10}X)`,
                    score: 3.8
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 6: THUẬT TOÁN XÁC SUẤT ====================
class ProbabilityAlgorithm {
    analyze(sessions) {
        if (sessions.length < 15) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        let last15 = sessions.slice(0, 15);
        let taiCount = last15.filter(s => s.isTai).length;
        let xiuCount = 15 - taiCount;
        
        // Phân tích bias hiện tại
        let currentRatio = taiCount / 15;
        
        // Nếu bias mạnh (>65%), dự đoán tiếp tục bias
        if (currentRatio >= 0.65) {
            return {
                prediction: 'Tài',
                confidence: Math.min(85, 60 + (currentRatio - 0.5) * 100),
                method: `Bias Tài mạnh (${(currentRatio*100).toFixed(1)}% trong 15 ván) → Bám Tài`,
                score: 4.0
            };
        }
        
        if (currentRatio <= 0.35) {
            return {
                prediction: 'Xỉu',
                confidence: Math.min(85, 60 + (0.5 - currentRatio) * 100),
                method: `Bias Xỉu mạnh (${(currentRatio*100).toFixed(1)}% trong 15 ván) → Bám Xỉu`,
                score: 4.0
            };
        }
        
        // Markov chain analysis
        let transitions = {
            'T->T': 0,
            'T->X': 0,
            'X->X': 0,
            'X->T': 0
        };
        
        for (let i = 0; i < last15.length - 1; i++) {
            let from = last15[i].isTai ? 'T' : 'X';
            let to = last15[i + 1].isTai ? 'T' : 'X';
            transitions[`${from}->${to}`]++;
        }
        
        let lastIsTai = last15[0].isTai;
        let sameTransitions = lastIsTai ? transitions['T->T'] : transitions['X->X'];
        let differentTransitions = lastIsTai ? transitions['T->X'] : transitions['X->T'];
        
        let total = sameTransitions + differentTransitions;
        if (total > 0) {
            let probabilitySame = sameTransitions / total;
            
            if (probabilitySame > 0.65) {
                return {
                    prediction: lastIsTai ? 'Tài' : 'Xỉu',
                    confidence: Math.floor(probabilitySame * 100 * 0.85),
                    method: `Xích Markov: Xác suất giữ nguyên ${(probabilitySame*100).toFixed(1)}% → BÁM CẦU`,
                    score: 4.0
                };
            }
            
            if (probabilitySame < 0.35) {
                return {
                    prediction: lastIsTai ? 'Xỉu' : 'Tài',
                    confidence: Math.floor((1 - probabilitySame) * 100 * 0.85),
                    method: `Xích Markov: Xác suất đảo chiều ${((1-probabilitySame)*100).toFixed(1)}% → ĐẢO CẦU`,
                    score: 3.8
                };
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 7: THUẬT TOÁN TỔNG HỢP NÂNG CAO ====================
class AdvancedCompositeAlgorithm {
    analyze(sessions) {
        if (sessions.length < 8) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        let results = [];
        let methods = [];
        
        // 1. Analyze dice sum trends
        let last5Sums = sessions.slice(0, 5).map(s => s.tong);
        let sumAvg = last5Sums.reduce((a, b) => a + b, 0) / 5;
        
        if (sumAvg < 9.0) {
            results.push('Tài');
            methods.push('Trung bình tổng thấp (≤9.0)');
        } else if (sumAvg > 12.0) {
            results.push('Xỉu');
            methods.push('Trung bình tổng cao (≥12.0)');
        }
        
        // 2. Analyze consecutive same results
        let consecutiveSame = 1;
        for (let i = 1; i < Math.min(sessions.length, 6); i++) {
            if (sessions[i].isTai === sessions[0].isTai) {
                consecutiveSame++;
            } else {
                break;
            }
        }
        
        if (consecutiveSame >= 3) {
            results.push(sessions[0].isTai ? 'Tài' : 'Xỉu'); // BÁM CẦU
            methods.push(`Bám cầu ${consecutiveSame} ván ${sessions[0].isTai ? 'Tài' : 'Xỉu'}`);
        }
        
        // 3. Time-based patterns
        let hour = new Date().getHours();
        if ((hour >= 20 && hour <= 23) || (hour >= 0 && hour <= 4)) {
            // Giờ cao điểm - ưu tiên bám cầu dài
            if (consecutiveSame >= 2) {
                results.push(sessions[0].isTai ? 'Tài' : 'Xỉu');
                methods.push('Giờ cao điểm - bám cầu');
            }
        } else {
            // Giờ thấp điểm - ưu tiên đảo cầu
            if (consecutiveSame >= 4) {
                results.push(sessions[0].isTai ? 'Xỉu' : 'Tài');
                methods.push('Giờ thấp điểm - đảo cầu dài');
            }
        }
        
        // 4. Majority vote
        if (sessions.length >= 7) {
            let last7 = sessions.slice(0, 7);
            let tai7 = last7.filter(s => s.isTai).length;
            let xiu7 = last7.filter(s => s.isXiu).length;
            
            if (tai7 >= 5) {
                results.push('Tài');
                methods.push(`Đa số Tài 7 ván (${tai7}T/${xiu7}X)`);
            } else if (xiu7 >= 5) {
                results.push('Xỉu');
                methods.push(`Đa số Xỉu 7 ván (${tai7}T/${xiu7}X)`);
            }
        }
        
        // 5. Count results
        let taiVotes = results.filter(r => r === 'Tài').length;
        let xiuVotes = results.filter(r => r === 'Xỉu').length;
        
        if (taiVotes === 0 && xiuVotes === 0) {
            return { prediction: null, confidence: 0, method: '', score: 0 };
        }
        
        let prediction = taiVotes > xiuVotes ? 'Tài' : 'Xỉu';
        let confidence = Math.min(85, 60 + Math.abs(taiVotes - xiuVotes) * 12);
        let methodStr = methods.join(' | ');
        
        return {
            prediction: prediction,
            confidence: confidence,
            method: `Tổng hợp: ${methodStr}`,
            score: 4.0
        };
    }
}

// ==================== ALGORITHM 8: PHÂN TÍCH ĐỘ LỆCH ====================
class DeviationAnalysisAlgorithm {
    analyze(sessions) {
        if (sessions.length < 20) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        let taiCount = 0;
        let xiuCount = 0;
        
        // Analyze last 20 sessions
        for (let i = 0; i < Math.min(sessions.length, 20); i++) {
            if (sessions[i].isTai) taiCount++;
            else xiuCount++;
        }
        
        let total = taiCount + xiuCount;
        let taiRatio = taiCount / total;
        
        // Nếu lệch mạnh (>70%), dự đoán BÁM bias
        if (taiRatio >= 0.7) {
            return {
                prediction: 'Tài',
                confidence: Math.min(88, 65 + (taiRatio - 0.5) * 80),
                method: `Độ lệch Tài cao: ${(taiRatio*100).toFixed(1)}% trong ${total} ván → BÁM TÀI`,
                score: 4.2
            };
        }
        
        if (taiRatio <= 0.3) {
            return {
                prediction: 'Xỉu',
                confidence: Math.min(88, 65 + (0.5 - taiRatio) * 80),
                method: `Độ lệch Xỉu cao: ${(taiRatio*100).toFixed(1)}% trong ${total} ván → BÁM XỈU`,
                score: 4.2
            };
        }
        
        // Nếu lệch vừa (60-70%), dự đoán tiếp tục
        if (taiRatio >= 0.6) {
            return {
                prediction: 'Tài',
                confidence: 75,
                method: `Nghiêng Tài: ${(taiRatio*100).toFixed(1)}% trong ${total} ván`,
                score: 3.8
            };
        }
        
        if (taiRatio <= 0.4) {
            return {
                prediction: 'Xỉu',
                confidence: 75,
                method: `Nghiêng Xỉu: ${(taiRatio*100).toFixed(1)}% trong ${total} ván`,
                score: 3.8
            };
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 9: PHÂN TÍCH CHU KỲ ====================
class CycleAnalysisAlgorithm {
    analyze(sessions) {
        if (sessions.length < 20) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        let pattern = [];
        for (let i = 0; i < Math.min(sessions.length, 20); i++) {
            pattern.push(sessions[i].isTai ? 1 : 0);
        }
        
        // Tìm chu kỳ 2-5
        for (let cycleLen = 2; cycleLen <= 5; cycleLen++) {
            if (pattern.length >= cycleLen * 3) {
                let matchCount = 0;
                let totalComparisons = 0;
                
                for (let i = 0; i < pattern.length - cycleLen; i++) {
                    if (pattern[i] === pattern[i + cycleLen]) {
                        matchCount++;
                    }
                    totalComparisons++;
                }
                
                let matchRatio = totalComparisons > 0 ? matchCount / totalComparisons : 0;
                
                if (matchRatio > 0.75) {
                    // Dự đoán theo chu kỳ
                    let cyclePosition = pattern.length % cycleLen;
                    let predictedValue = pattern[cyclePosition];
                    
                    return {
                        prediction: predictedValue === 1 ? 'Tài' : 'Xỉu',
                        confidence: Math.min(90, Math.floor(matchRatio * 100 * 0.9)),
                        method: `Chu kỳ ${cycleLen} ván (độ khớp ${(matchRatio*100).toFixed(1)}%) → Dự đoán theo chu kỳ`,
                        score: 4.5
                    };
                }
            }
        }
        
        return { prediction: null, confidence: 0, method: '', score: 0 };
    }
}

// ==================== ALGORITHM 10: THUẬT TOÁN BÁM ĐA SỐ (FALLBACK MẠNH) ====================
class MajorityAlgorithm {
    analyze(sessions) {
        if (sessions.length < 5) return { prediction: null, confidence: 0, method: '', score: 0 };
        
        // LUÔN có dự đoán dựa trên đa số 10 ván gần nhất
        let windowSize = Math.min(sessions.length, 10);
        let recentSessions = sessions.slice(0, windowSize);
        
        let taiCount = recentSessions.filter(s => s.isTai).length;
        let xiuCount = windowSize - taiCount;
        
        if (taiCount > xiuCount) {
            return {
                prediction: 'Tài',
                confidence: Math.min(75, 50 + (taiCount - xiuCount) * 5),
                method: `Bám đa số Tài (${taiCount}T/${xiuCount}X ${windowSize} ván gần nhất)`,
                score: 3.5
            };
        } else if (xiuCount > taiCount) {
            return {
                prediction: 'Xỉu',
                confidence: Math.min(75, 50 + (xiuCount - taiCount) * 5),
                method: `Bám đa số Xỉu (${taiCount}T/${xiuCount}X ${windowSize} ván gần nhất)`,
                score: 3.5
            };
        } else {
            // Nếu bằng nhau, bám ván trước
            let lastSession = sessions[0];
            return {
                prediction: lastSession.isTai ? 'Tài' : 'Xỉu',
                confidence: 55,
                method: `Bám ván trước (tỷ số hòa ${taiCount}T/${xiuCount}X)`,
                score: 3.0
            };
        }
    }
}

// ==================== MAIN ANALYZER ====================
class TaiXiuAnalyzer {
    constructor() {
        this.algorithms = [
            new CauBamAlgorithm(),          // Algorithm 0: Cầu bám mạnh (ƯU TIÊN CAO)
            new CauBetAlgorithm(),          // Algorithm 1: Cầu bệt (đã sửa bám cầu)
            new CauDaoAlgorithm(),          // Algorithm 2: Cầu đảo
            new CauNghiengAlgorithm(),      // Algorithm 3: Cầu nghiêng
            new DiceAnalysisAlgorithm(),    // Algorithm 4: Phân tích xúc xắc
            new PatternAnalysisAlgorithm(), // Algorithm 5: Phân tích pattern
            new ProbabilityAlgorithm(),     // Algorithm 6: Xác suất
            new AdvancedCompositeAlgorithm(), // Algorithm 7: Tổng hợp
            new DeviationAnalysisAlgorithm(), // Algorithm 8: Độ lệch
            new CycleAnalysisAlgorithm(),   // Algorithm 9: Chu kỳ
            new MajorityAlgorithm()         // Algorithm 10: Đa số (LUÔN có dự đoán)
        ];
        
        // Tăng weight cho các thuật toán bám cầu
        this.algorithmWeights = [5.0, 4.5, 3.8, 4.2, 3.5, 4.0, 3.8, 4.0, 4.2, 4.5, 4.0];
    }
    
    analyze(sessions) {
        // Đảm bảo sessions đã được sort và validate trước khi vào đây
        let results = [];
        let allMethods = [];
        let usedAlgorithms = 0;
        
        // Run all algorithms
        for (let i = 0; i < this.algorithms.length; i++) {
            let result = this.algorithms[i].analyze(sessions);
            if (result.prediction) {
                result.algorithmId = i;
                result.weightedScore = result.score * this.algorithmWeights[i];
                results.push(result);
                allMethods.push(`A${i}: ${result.method}`);
                usedAlgorithms++;
            }
        }
        
        // LUÔN có dự đoán - Algorithm 10 (MajorityAlgorithm) LUÔN trả kết quả
        if (results.length === 0) {
            // Fallback cứng: bám đa số 5 ván gần nhất
            let last5 = sessions.slice(0, Math.min(sessions.length, 5));
            let taiCount = last5.filter(s => s.isTai).length;
            let xiuCount = last5.length - taiCount;
            
            let fallbackPrediction = taiCount >= xiuCount ? 'Tài' : 'Xỉu';
            let confidence = Math.max(55, 50 + Math.abs(taiCount - xiuCount) * 10);
            
            let result = new AnalysisResult({
                du_doan: fallbackPrediction,
                do_tin_cay: `${confidence}%`,
                do_manh: confidence >= 65 ? 'MẠNH' : (confidence >= 55 ? 'KHÁ' : 'YẾU'),
                phuong_phap: `Fallback: Bám đa số ${taiCount}T/${xiuCount}X 5 ván gần nhất`,
                thong_tin_bo_sung: {
                    thuat_toan_su_dung: 1,
                    patterns_da_tai: 0,
                    diem_so: {
                        totalAlgorithms: 11,
                        agreeingAlgorithms: 1,
                        taiScore: fallbackPrediction === 'Tài' ? '1.00' : '0.00',
                        xiuScore: fallbackPrediction === 'Xỉu' ? '1.00' : '0.00',
                        scoreDifference: '1.00',
                        agreementRatio: 9
                    },
                    xuc_xac_cuoi: sessions[0]?.dices || [0,0,0]
                }
            });
            
            return result;
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
        else if (confidence >= 55) strength = 'TRUNG BÌNH';
        else strength = 'YẾU';
        
        // Build method string
        let methodStr = '';
        let topResults = results.sort((a, b) => b.weightedScore - a.weightedScore).slice(0, 3);
        topResults.forEach((r, idx) => {
            if (idx > 0) methodStr += ' | ';
            methodStr += r.method;
        });
        
        let result = new AnalysisResult();
        result.du_doan = finalPrediction;
        result.do_tin_cay = `${Math.round(confidence)}%`;
        result.do_manh = strength;
        result.phuong_phap = methodStr;
        result.thong_tin_bo_sung.thuat_toan_su_dung = usedAlgorithms;
        result.thong_tin_bo_sung.patterns_da_tai = results.length;
        result.thong_tin_bo_sung.diem_so.totalAlgorithms = 11;
        result.thong_tin_bo_sung.diem_so.agreeingAlgorithms = results.filter(r => r.prediction === finalPrediction).length;
        result.thong_tin_bo_sung.diem_so.taiScore = taiScore;
        result.thong_tin_bo_sung.diem_so.xiuScore = xiuScore;
        result.thong_tin_bo_sung.diem_so.scoreDifference = scoreDifference;
        result.thong_tin_bo_sung.diem_so.agreementRatio = agreementRatio;
        result.thong_tin_bo_sung.xuc_xac_cuoi = sessions[0]?.dices || [0,0,0];
        
        return result;
    }
}

// ==================== API FETCHERS (ĐÃ SỬA SORT + VALIDATE) ====================
async function fetchSunwinData() {
    try {
        const response = await axios.get(API_CONFIG.SUNWIN, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.data && Array.isArray(response.data)) {
            // Tạo sessions và validate
            let sessions = [];
            for (let item of response.data) {
                try {
                    let session = new SessionData(
                        item.phien,
                        item.xuc_xac_1,
                        item.xuc_xac_2,
                        item.xuc_xac_3,
                        item.tong,
                        item.ket_qua
                    );
                    
                    if (session.validate()) {
                        sessions.push(session);
                    }
                } catch (e) {
                    console.warn('Invalid Sunwin session skipped:', item);
                }
            }
            
            // SORT GIẢM DẦN THEO PHIÊN (mới nhất đầu tiên)
            sessions.sort((a, b) => b.phien - a.phien);
            
            return sessions;
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
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        
        if (response.data && response.data.list && Array.isArray(response.data.list)) {
            // Tạo sessions và validate
            let sessions = [];
            for (let item of response.data.list) {
                try {
                    let session = new SessionData(
                        item.id,
                        item.dices[0],
                        item.dices[1],
                        item.dices[2],
                        item.point,
                        item.resultTruyenThong
                    );
                    
                    if (session.validate()) {
                        sessions.push(session);
                    }
                } catch (e) {
                    console.warn('Invalid LC79 session skipped:', item);
                }
            }
            
            // SORT GIẢM DẦN THEO ID (mới nhất đầu tiên)
            sessions.sort((a, b) => b.phien - a.phien);
            
            return sessions;
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
                error: 'Không lấy được dữ liệu từ Sunwin hoặc dữ liệu rỗng'
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
                    ket_qua: lastSession.isTai ? 'Tài' : 'Xỉu'
                },
                current_session: lastSession.phien,
                next_session: lastSession.phien + 1,
                du_doan: analysis.du_doan,
                do_tin_cay: analysis.do_tin_cay,
                do_manh: analysis.do_manh,
                phuong_phap: analysis.phuong_phap,
                thong_tin_bo_sung: analysis.thong_tin_bo_sung
            },
            timestamp: new Date().toISOString(),
            sessions_count: sessions.length
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('Sunwin route error:', error);
        res.json({
            success: false,
            error: 'Lỗi server: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/lc79', async (req, res) => {
    try {
        const sessions = await fetchLC79Data();
        
        if (sessions.length === 0) {
            return res.json({
                success: false,
                error: 'Không lấy được dữ liệu từ LC79 hoặc dữ liệu rỗng'
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
                    ket_qua: lastSession.isTai ? 'Tài' : 'Xỉu'
                },
                current_session: lastSession.phien,
                next_session: lastSession.phien + 1,
                du_doan: analysis.du_doan,
                do_tin_cay: analysis.do_tin_cay,
                do_manh: analysis.do_manh,
                phuong_phap: analysis.phuong_phap,
                thong_tin_bo_sung: analysis.thong_tin_bo_sung
            },
            timestamp: new Date().toISOString(),
            sessions_count: sessions.length
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('LC79 route error:', error);
        res.json({
            success: false,
            error: 'Lỗi server: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'CUONGDEVGPT Tai Xiu Prediction API - BÁM CẦU MẠNH',
        version: '2.0.1',
        endpoints: ['/sunwin', '/lc79', '/status', '/sunwin/cached', '/lc79/cached'],
        creator: 'Big dad Cuongdepzaivcl',
        algorithms: 11,
        features: 'BÁM CẦU MẠNH | LUÔN CÓ DỰ ĐOÁN | ĐA THUẬT TOÁN',
        message: 'API đang hoạt động bình thường! 🚀 LUÔN TRẢ DỰ ĐOÁN TÀI/XỈU!'
    });
});

app.get('/status', async (req, res) => {
    const sunwinData = await fetchSunwinData();
    const lc79Data = await fetchLC79Data();
    
    // Test analyzer
    let sunwinPrediction = null;
    let lc79Prediction = null;
    
    if (sunwinData.length > 0) {
        const analyzer = new TaiXiuAnalyzer();
        const analysis = analyzer.analyze(sunwinData);
        sunwinPrediction = analysis.du_doan;
    }
    
    if (lc79Data.length > 0) {
        const analyzer = new TaiXiuAnalyzer();
        const analysis = analyzer.analyze(lc79Data);
        lc79Prediction = analysis.du_doan;
    }
    
    res.json({
        sunwin: {
            status: sunwinData.length > 0 ? 'online' : 'offline',
            sessions: sunwinData.length,
            last_session: sunwinData[0] || null,
            prediction: sunwinPrediction
        },
        lc79: {
            status: lc79Data.length > 0 ? 'online' : 'offline',
            sessions: lc79Data.length,
            last_session: lc79Data[0] || null,
            prediction: lc79Prediction
        },
        server_time: new Date().toISOString(),
        memory_usage: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
            heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        },
        note: 'Hệ thống LUÔN trả dự đoán, ưu tiên BÁM CẦU'
    });
});

// ==================== AUTO REFRESH SYSTEM ====================
class AutoRefreshSystem {
    constructor() {
        this.sunwinCache = [];
        this.lc79Cache = [];
        this.lastUpdate = {};
        this.cacheDuration = 8000; // 8 seconds
        this.isRefreshing = false;
        
        // Start auto-refresh
        this.startAutoRefresh();
    }
    
    async refreshSunwin() {
        if (this.isRefreshing) return;
        
        this.isRefreshing = true;
        try {
            this.sunwinCache = await fetchSunwinData();
            this.lastUpdate.sunwin = new Date();
            console.log(`[${new Date().toLocaleTimeString()}] Sunwin refreshed: ${this.sunwinCache.length} sessions`);
        } catch (error) {
            console.error('Auto-refresh Sunwin failed:', error.message);
        } finally {
            this.isRefreshing = false;
        }
    }
    
    async refreshLC79() {
        if (this.isRefreshing) return;
        
        this.isRefreshing = true;
        try {
            this.lc79Cache = await fetchLC79Data();
            this.lastUpdate.lc79 = new Date();
            console.log(`[${new Date().toLocaleTimeString()}] LC79 refreshed: ${this.lc79Cache.length} sessions`);
        } catch (error) {
            console.error('Auto-refresh LC79 failed:', error.message);
        } finally {
            this.isRefreshing = false;
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
        
        console.log('Auto-refresh system started! 🔄 Cache: 8s');
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
                error: 'Cache Sunwin chưa sẵn sàng, đang refresh...',
                retry_after: '8s'
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
                    ket_qua: lastSession.isTai ? 'Tài' : 'Xỉu'
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
            last_updated: refreshSystem.lastUpdate.sunwin,
            sessions_count: sessions.length,
            cache_age: refreshSystem.lastUpdate.sunwin ? 
                Math.round((new Date() - refreshSystem.lastUpdate.sunwin) / 1000) + 's' : 'N/A'
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('Sunwin cached route error:', error);
        res.json({
            success: false,
            error: 'Lỗi server cached: ' + error.message
        });
    }
});

app.get('/lc79/cached', async (req, res) => {
    try {
        const sessions = refreshSystem.getLC79Data();
        
        if (sessions.length === 0) {
            return res.json({
                success: false,
                error: 'Cache LC79 chưa sẵn sàng, đang refresh...',
                retry_after: '8s'
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
                    ket_qua: lastSession.isTai ? 'Tài' : 'Xỉu'
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
            last_updated: refreshSystem.lastUpdate.lc79,
            sessions_count: sessions.length,
            cache_age: refreshSystem.lastUpdate.lc79 ? 
                Math.round((new Date() - refreshSystem.lastUpdate.lc79) / 1000) + 's' : 'N/A'
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('LC79 cached route error:', error);
        res.json({
            success: false,
            error: 'Lỗi server cached: ' + error.message
        });
    }
});

// ==================== TEST ENDPOINT ====================
app.get('/test', async (req, res) => {
    // Test với dữ liệu mẫu
    const testSessions = [
        new SessionData(100, 3, 4, 5, 12, 'TAI'),
        new SessionData(99, 2, 3, 4, 9, 'XIU'),
        new SessionData(98, 4, 4, 4, 12, 'TAI'),
        new SessionData(97, 1, 2, 3, 6, 'XIU'),
        new SessionData(96, 5, 6, 6, 17, 'TAI'),
        new SessionData(95, 2, 2, 3, 7, 'XIU'),
        new SessionData(94, 4, 5, 6, 15, 'TAI'),
        new SessionData(93, 1, 1, 2, 4, 'XIU'),
        new SessionData(92, 3, 3, 3, 9, 'XIU'),
        new SessionData(91, 6, 6, 6, 18, 'TAI')
    ];
    
    // Sort giảm dần
    testSessions.sort((a, b) => b.phien - a.phien);
    
    const analyzer = new TaiXiuAnalyzer();
    const analysis = analyzer.analyze(testSessions);
    
    res.json({
        success: true,
        test: 'BÁM CẦU MẠNH - LUÔN CÓ DỰ ĐOÁN',
        prediction: analysis.du_doan,
        confidence: analysis.do_tin_cay,
        strength: analysis.do_manh,
        method: analysis.phuong_phap,
        algorithms_used: analysis.thong_tin_bo_sung.thuat_toan_su_dung,
        note: 'Hệ thống LUÔN trả dự đoán, ưu tiên bám cầu, bắt cầu mạnh'
    });
});

// ==================== START SERVER ====================
app.listen(port, () => {
    console.log(`=========================================`);
    console.log(`🚀 CUONGDEVGPT Tai Xiu API - BÁM CẦU MẠNH!`);
    console.log(`📍 Port: ${port}`);
    console.log(`👑 Creator: Big dad Cuongdepzaivcl`);
    console.log(`🔢 Algorithms: 11 thuật toán BÁM CẦU`);
    console.log(`🎯 Ưu tiên: BÁM CẦU - LUÔN CÓ DỰ ĐOÁN`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log(`=========================================`);
    console.log(`📊 Endpoints (LUÔN CÓ DỰ ĐOÁN):`);
    console.log(`   GET /             - Health check`);
    console.log(`   GET /status       - System status + prediction`);
    console.log(`   GET /sunwin       - Dự đoán Sunwin (real-time)`);
    console.log(`   GET /lc79         - Dự đoán LC79 (real-time)`);
    console.log(`   GET /sunwin/cached - Sunwin (cached, nhanh)`);
    console.log(`   GET /lc79/cached   - LC79 (cached, nhanh)`);
    console.log(`   GET /test         - Test với dữ liệu mẫu`);
    console.log(`=========================================`);
    console.log(`⚡ ĐẶC ĐIỂM HỆ THỐNG:`);
    console.log(`   ✅ LUÔN trả dự đoán Tài/Xỉu`);
    console.log(`   ✅ Ưu tiên BÁM CẦU mạnh (streak ≥3)`);
    console.log(`   ✅ Data được sort + validate`);
    console.log(`   ✅ 11 thuật toán bắt cầu`);
    console.log(`   ✅ Fallback: Bám đa số 5 ván gần nhất`);
    console.log(`=========================================`);
});

// ==================== ERROR HANDLING ====================
process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', error.message);
    console.error(error.stack);
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