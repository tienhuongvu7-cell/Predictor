const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Cấu hình API endpoints
const API_CONFIG = {
    SUNWIN: 'http://180.93.52.196:3001/api/his',
    LC79: 'https://wtxmd52.tele68.com/v1/txmd5/sessions'
};

// Biến lưu trữ cache
let cache = {
    sunwin: { data: null, timestamp: 0 },
    lc79: { data: null, timestamp: 0 },
    predictions: { sunwin: null, lc79: null }
};

// Các thuật toán dự đoán
class TaiXiuPredictor {
    constructor() {
        this.algorithms = [
            this.analyzeStreakPattern,
            this.analyze121Pattern,
            this.analyzeNhipNghieng,
            this.analyzeDicePosition,
            this.analyzeSumRange,
            this.analyzeTimePattern,
            this.analyzePhienNumber,
            this.analyzeDicePairs,
            this.analyzeFibonacciPattern,
            this.analyzeDiceDirection,
            this.analyzeChartPattern,
            this.analyzeGapTheory,
            this.analyzeZeroFrequency,
            this.analyzePointRotation,
            this.analyzeAdvancedPatterns
        ];
    }

    // 1. Phân tích cầu bệt (Streak Pattern)
    analyzeStreakPattern(results, diceHistory) {
        if (results.length < 8) return null;
        
        const last8 = results.slice(-8);
        const streakCount = this.getCurrentStreak(results);
        
        // Cầu bệt dài > 5 thì sắp gãy
        if (streakCount.streak >= 5) {
            const prediction = streakCount.type === 'TAI' ? 'XIU' : 'TAI';
            return {
                prediction,
                confidence: Math.min(85, 40 + (streakCount.streak * 7)),
                method: `Cầu bệt ${streakCount.type} dài ${streakCount.streak} ván → Bẻ cầu ${prediction}`,
                score: streakCount.type === 'TAI' ? { tai: -3, xiu: 3 } : { tai: 3, xiu: -3 }
            };
        }
        
        // Tiếp tục cầu bệt nếu đang có đà
        if (streakCount.streak >= 3) {
            return {
                prediction: streakCount.type,
                confidence: 65 + (streakCount.streak * 3),
                method: `Cầu bệt ${streakCount.type} tiếp diễn (${streakCount.streak} ván)`,
                score: streakCount.type === 'TAI' ? { tai: 2, xiu: -2 } : { tai: -2, xiu: 2 }
            };
        }
        
        return null;
    }

    // 2. Phân tích cầu 1-2-1, 2-2, 3-3
    analyze121Pattern(results, diceHistory) {
        if (results.length < 10) return null;
        
        const last10 = results.slice(-10);
        
        // Kiểm tra cầu 1-1 (xen kẽ)
        let is11Pattern = true;
        for (let i = 0; i < last10.length - 1; i++) {
            if (last10[i] === last10[i + 1]) {
                is11Pattern = false;
                break;
            }
        }
        
        if (is11Pattern) {
            const lastResult = results[results.length - 1];
            const prediction = lastResult === 'TAI' ? 'XIU' : 'TAI';
            return {
                prediction,
                confidence: 72,
                method: 'Cầu 1-1 xen kẽ chặt chẽ',
                score: prediction === 'TAI' ? { tai: 1.5, xiu: -1.5 } : { tai: -1.5, xiu: 1.5 }
            };
        }
        
        // Kiểm tra cầu 2-2
        const pattern22 = this.checkPattern22(last10);
        if (pattern22.found) {
            return {
                prediction: pattern22.prediction,
                confidence: 68,
                method: `Cầu 2-2 (${pattern22.pattern})`,
                score: pattern22.prediction === 'TAI' ? { tai: 1.2, xiu: -1.2 } : { tai: -1.2, xiu: 1.2 }
            };
        }
        
        return null;
    }

    // 3. Phân tích cầu nhịp nghiêng
    analyzeNhipNghieng(results, diceHistory) {
        if (results.length < 10) return null;
        
        const last10 = results.slice(-10);
        const taiCount = last10.filter(r => r === 'TAI').length;
        const xiuCount = last10.length - taiCount;
        
        // Tính độ nghiêng
        const ratio = Math.abs(taiCount - xiuCount) / last10.length;
        
        if (ratio >= 0.3) { // Nghiêng rõ rệt
            const dominant = taiCount > xiuCount ? 'TAI' : 'XIU';
            const prediction = dominant;
            
            // Nếu nghiêng quá mạnh (7-3) thì cân nhắc bẻ cầu
            if (Math.abs(taiCount - xiuCount) >= 4) {
                const shouldBreak = Math.random() > 0.7; // 30% xác suất bẻ
                if (shouldBreak) {
                    return {
                        prediction: dominant === 'TAI' ? 'XIU' : 'TAI',
                        confidence: 55,
                        method: `Cầu nghiêng mạnh ${dominant} (${taiCount}-${xiuCount}) → Cân bằng`,
                        score: dominant === 'TAI' ? { tai: -1, xiu: 1 } : { tai: 1, xiu: -1 }
                    };
                }
            }
            
            return {
                prediction,
                confidence: 60 + (ratio * 20),
                method: `Cầu nhịp nghiêng ${dominant} (${taiCount}-${xiuCount})`,
                score: dominant === 'TAI' ? { tai: 1, xiu: -1 } : { tai: -1, xiu: 1 }
            };
        }
        
        return null;
    }

    // 4. Phân tích vị trí xúc xắc (mẹo xúc xắc)
    analyzeDicePosition(results, diceHistory) {
        if (diceHistory.length < 2) return null;
        
        const lastDice = diceHistory[diceHistory.length - 1];
        const prevDice = diceHistory[diceHistory.length - 2];
        
        // Mẹo: 3 con chĩa mũi xuống dưới (số nhỏ: 1,2,3) thì bắt Tài
        const smallNumbers = lastDice.filter(d => d <= 3).length;
        const largeNumbers = lastDice.filter(d => d >= 4).length;
        
        // Mẹo: Nếu có 2 hoặc 3 số nhỏ
        if (smallNumbers >= 2) {
            return {
                prediction: 'TAI',
                confidence: 65,
                method: `Xúc xắc nghiêng số nhỏ (${lastDice}) → Tài mạnh`,
                score: { tai: 1.8, xiu: -1.8 }
            };
        }
        
        // Mẹo: Nếu có 2 hoặc 3 số lớn
        if (largeNumbers >= 2) {
            return {
                prediction: 'XIU',
                confidence: 65,
                method: `Xúc xắc nghiêng số lớn (${lastDice}) → Xỉu mạnh`,
                score: { tai: -1.8, xiu: 1.8 }
            };
        }
        
        // Mẹo: Có cặp hoặc bão (3 số giống nhau)
        const diceSet = new Set(lastDice);
        if (diceSet.size === 1) { // Bão
            return {
                prediction: results[results.length - 1] === 'TAI' ? 'XIU' : 'TAI',
                confidence: 70,
                method: `Bão ${lastDice[0]} → Đảo chiều`,
                score: results[results.length - 1] === 'TAI' ? { tai: -2, xiu: 2 } : { tai: 2, xiu: -2 }
            };
        }
        
        if (diceSet.size === 2) { // Có cặp
            // Tìm số xuất hiện 2 lần
            const counts = {};
            lastDice.forEach(d => counts[d] = (counts[d] || 0) + 1);
            const pairValue = Object.keys(counts).find(k => counts[k] === 2);
            
            if (pairValue <= 3) { // Cặp số nhỏ
                return {
                    prediction: 'TAI',
                    confidence: 60,
                    method: `Cặp số nhỏ ${pairValue} → Tài`,
                    score: { tai: 1.2, xiu: -1.2 }
                };
            } else { // Cặp số lớn
                return {
                    prediction: 'XIU',
                    confidence: 60,
                    method: `Cặp số lớn ${pairValue} → Xỉu`,
                    score: { tai: -1.2, xiu: 1.2 }
                };
            }
        }
        
        return null;
    }

    // 5. Phân tích tổng điểm
    analyzeSumRange(results, diceHistory) {
        if (diceHistory.length < 3) return null;
        
        const lastSums = diceHistory.slice(-5).map(d => d.reduce((a, b) => a + b, 0));
        const lastSum = lastSums[lastSums.length - 1];
        
        // Phân vùng điểm số
        if (lastSum <= 7) { // Rất thấp
            return {
                prediction: 'TAI',
                confidence: 75,
                method: `Tổng điểm thấp (${lastSum}) → Bật lên Tài`,
                score: { tai: 2.5, xiu: -2.5 }
            };
        }
        
        if (lastSum >= 15) { // Rất cao
            return {
                prediction: 'XIU',
                confidence: 75,
                method: `Tổng điểm cao (${lastSum}) → Hồi về Xỉu`,
                score: { tai: -2.5, xiu: 2.5 }
            };
        }
        
        if (lastSum >= 9 && lastSum <= 12) { // Vùng trung bình
            // Kiểm tra xu hướng
            const avgSum = lastSums.reduce((a, b) => a + b, 0) / lastSums.length;
            if (lastSum > avgSum) {
                return {
                    prediction: 'XIU',
                    confidence: 60,
                    method: `Tổng ${lastSum} > trung bình ${avgSum.toFixed(1)} → Xỉu`,
                    score: { tai: -0.8, xiu: 0.8 }
                };
            } else {
                return {
                    prediction: 'TAI',
                    confidence: 60,
                    method: `Tổng ${lastSum} < trung bình ${avgSum.toFixed(1)} → Tài`,
                    score: { tai: 0.8, xiu: -0.8 }
                };
            }
        }
        
        return null;
    }

    // 6. Phân tích thời gian (giả lập)
    analyzeTimePattern(results, diceHistory) {
        const hour = new Date().getHours();
        
        // Giờ cao điểm (19h-23h): cầu loạn, đánh 1-1
        if (hour >= 19 && hour <= 23) {
            if (results.length >= 3) {
                const last3 = results.slice(-3);
                // Kiểm tra có phải đang 1-1 không
                if (last3[0] !== last3[1] && last3[1] !== last3[2]) {
                    const lastResult = results[results.length - 1];
                    const prediction = lastResult === 'TAI' ? 'XIU' : 'TAI';
                    return {
                        prediction,
                        confidence: 65,
                        method: `Giờ cao điểm (${hour}h): Theo cầu 1-1`,
                        score: prediction === 'TAI' ? { tai: 1, xiu: -1 } : { tai: -1, xiu: 1 }
                    };
                }
            }
        }
        
        // Giờ thấp điểm (0h-6h): dễ có cầu bệt
        if (hour >= 0 && hour <= 6) {
            const streak = this.getCurrentStreak(results);
            if (streak.streak >= 2) {
                return {
                    prediction: streak.type,
                    confidence: 70,
                    method: `Giờ thấp điểm (${hour}h): Bám cầu bệt`,
                    score: streak.type === 'TAI' ? { tai: 1.5, xiu: -1.5 } : { tai: -1.5, xiu: 1.5 }
                };
            }
        }
        
        return null;
    }

    // 7. Phân tích số phiên
    analyzePhienNumber(results, diceHistory, currentPhien) {
        if (!currentPhien) return null;
        
        const lastDigit = currentPhien % 10;
        const lastSum = diceHistory.length > 0 ? 
            diceHistory[diceHistory.length - 1].reduce((a, b) => a + b, 0) : 0;
        
        // Công thức: số cuối phiên + tổng điểm ván trước
        const formulaResult = lastDigit + lastSum;
        
        if (formulaResult % 2 === 0) {
            return {
                prediction: 'TAI',
                confidence: 58,
                method: `Công thức phiên: ${lastDigit} + ${lastSum} = ${formulaResult} (chẵn) → Tài`,
                score: { tai: 0.5, xiu: -0.5 }
            };
        } else {
            return {
                prediction: 'XIU',
                confidence: 58,
                method: `Công thức phiên: ${lastDigit} + ${lastSum} = ${formulaResult} (lẻ) → Xỉu`,
                score: { tai: -0.5, xiu: 0.5 }
            };
        }
    }

    // 8. Phân tích cặp xúc xắc
    analyzeDicePairs(results, diceHistory) {
        if (diceHistory.length < 3) return null;
        
        const lastDice = diceHistory[diceHistory.length - 1];
        const prevDice = diceHistory[diceHistory.length - 2];
        
        // Kiểm tra sự tương quan giữa 2 ván gần nhất
        const lastSum = lastDice.reduce((a, b) => a + b, 0);
        const prevSum = prevDice.reduce((a, b) => a + b, 0);
        
        // Nếu tổng điểm thay đổi đột ngột
        const diff = Math.abs(lastSum - prevSum);
        if (diff >= 8) {
            const prediction = lastSum > prevSum ? 'XIU' : 'TAI';
            return {
                prediction,
                confidence: 62,
                method: `Biến động mạnh: ${prevSum} → ${lastSum} (chênh ${diff}) → ${prediction}`,
                score: prediction === 'TAI' ? { tai: 1, xiu: -1 } : { tai: -1, xiu: 1 }
            };
        }
        
        return null;
    }

    // 9. Phân tích Fibonacci pattern
    analyzeFibonacciPattern(results, diceHistory) {
        if (results.length < 8) return null;
        
        // Tìm chu kỳ Fibonacci trong kết quả
        const patterns = this.findFibonacciPatterns(results);
        if (patterns.length > 0) {
            const bestPattern = patterns[0];
            const nextPrediction = this.predictNextFibonacci(bestPattern, results);
            
            if (nextPrediction) {
                return {
                    prediction: nextPrediction,
                    confidence: 68,
                    method: `Pattern Fibonacci: ${bestPattern.pattern.join('-')}`,
                    score: nextPrediction === 'TAI' ? { tai: 1.3, xiu: -1.3 } : { tai: -1.3, xiu: 1.3 }
                };
            }
        }
        
        return null;
    }

    // 10. Phân tích hướng xúc xắc (nâng cao)
    analyzeDiceDirection(results, diceHistory) {
        if (diceHistory.length < 4) return null;
        
        // Tính xu hướng của từng vị trí xúc xắc
        const trends = [[], [], []];
        for (let i = 0; i < 3; i++) {
            for (let j = Math.max(0, diceHistory.length - 4); j < diceHistory.length - 1; j++) {
                const diff = diceHistory[j + 1][i] - diceHistory[j][i];
                trends[i].push(diff > 0 ? 'UP' : diff < 0 ? 'DOWN' : 'SAME');
            }
        }
        
        // Phân tích xu hướng
        let upCount = 0, downCount = 0;
        trends.forEach(trend => {
            trend.forEach(t => {
                if (t === 'UP') upCount++;
                if (t === 'DOWN') downCount++;
            });
        });
        
        if (upCount > downCount * 1.5) {
            return {
                prediction: 'XIU',
                confidence: 63,
                method: `Xu hướng xúc xắc đi lên (${upCount}↑/${downCount}↓) → Xỉu`,
                score: { tai: -1, xiu: 1 }
            };
        } else if (downCount > upCount * 1.5) {
            return {
                prediction: 'TAI',
                confidence: 63,
                method: `Xu hướng xúc xắc đi xuống (${upCount}↑/${downCount}↓) → Tài`,
                score: { tai: 1, xiu: -1 }
            };
        }
        
        return null;
    }

    // 11. Phân tích biểu đồ
    analyzeChartPattern(results, diceHistory) {
        if (results.length < 15) return null;
        
        const last15 = results.slice(-15);
        const sums = diceHistory.slice(-15).map(d => d.reduce((a, b) => a + b, 0));
        
        // Tìm đỉnh và đáy
        const peaks = this.findPeaks(sums);
        const valleys = this.findValleys(sums);
        
        // Nếu vừa chạm đỉnh
        if (peaks.length > 0 && peaks[peaks.length - 1].index >= sums.length - 3) {
            return {
                prediction: 'XIU',
                confidence: 70,
                method: `Biểu đồ chạm đỉnh (${sums[sums.length - 1]} điểm) → Hồi Xỉu`,
                score: { tai: -1.8, xiu: 1.8 }
            };
        }
        
        // Nếu vừa chạm đáy
        if (valleys.length > 0 && valleys[valleys.length - 1].index >= sums.length - 3) {
            return {
                prediction: 'TAI',
                confidence: 70,
                method: `Biểu đồ chạm đáy (${sums[sums.length - 1]} điểm) → Bật Tài`,
                score: { tai: 1.8, xiu: -1.8 }
            };
        }
        
        return null;
    }

    // 12. Lý thuyết khoảng cách
    analyzeGapTheory(results, diceHistory) {
        if (results.length < 20) return null;
        
        // Tính khoảng cách giữa các lần xuất hiện Tài/Xỉu
        const gaps = this.calculateGaps(results);
        
        // Nếu khoảng cách hiện tại lớn hơn trung bình
        const currentGap = gaps.current;
        const avgGap = gaps.average;
        
        if (currentGap > avgGap * 1.5) {
            const prediction = gaps.lastType === 'TAI' ? 'XIU' : 'TAI';
            return {
                prediction,
                confidence: 67,
                method: `Khoảng cách ${gaps.lastType} lớn (${currentGap} > ${avgGap.toFixed(1)}) → ${prediction}`,
                score: prediction === 'TAI' ? { tai: 1.2, xiu: -1.2 } : { tai: -1.2, xiu: 1.2 }
            };
        }
        
        return null;
    }

    // 13. Tần suất zero (điểm chưa xuất hiện)
    analyzeZeroFrequency(results, diceHistory) {
        if (diceHistory.length < 30) return null;
        
        const allSums = diceHistory.map(d => d.reduce((a, b) => a + b, 0));
        const sumRange = Array.from({length: 15}, (_, i) => i + 4); // Tổng từ 4-18
        
        // Tìm các tổng chưa xuất hiện trong 20 ván gần nhất
        const recentSums = allSums.slice(-20);
        const missingSums = sumRange.filter(sum => !recentSums.includes(sum));
        
        if (missingSums.length > 0) {
            // Ưu tiên các tổng cực trị
            const extremeSums = missingSums.filter(s => s <= 7 || s >= 15);
            if (extremeSums.length > 0) {
                const targetSum = extremeSums[0];
                const prediction = targetSum >= 11 ? 'TAI' : 'XIU';
                return {
                    prediction,
                    confidence: 60,
                    method: `Điểm ${targetSum} chưa xuất hiện 20 ván → ${prediction}`,
                    score: prediction === 'TAI' ? { tai: 0.8, xiu: -0.8 } : { tai: -0.8, xiu: 0.8 }
                };
            }
        }
        
        return null;
    }

    // 14. Phân tích xoay vòng điểm
    analyzePointRotation(results, diceHistory) {
        if (diceHistory.length < 10) return null;
        
        const sums = diceHistory.slice(-10).map(d => d.reduce((a, b) => a + b, 0));
        
        // Tính độ lệch chuẩn
        const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
        const variance = sums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sums.length;
        const stdDev = Math.sqrt(variance);
        
        // Nếu biến động thấp (cầu ổn định)
        if (stdDev < 3) {
            const lastSum = sums[sums.length - 1];
            if (lastSum < 10.5) {
                return {
                    prediction: 'TAI',
                    confidence: 65,
                    method: `Cầu ổn định (σ=${stdDev.toFixed(1)}), tổng ${lastSum} → Tài`,
                    score: { tai: 1.2, xiu: -1.2 }
                };
            } else {
                return {
                    prediction: 'XIU',
                    confidence: 65,
                    method: `Cầu ổn định (σ=${stdDev.toFixed(1)}), tổng ${lastSum} → Xỉu`,
                    score: { tai: -1.2, xiu: 1.2 }
                };
            }
        }
        
        return null;
    }

    // 15. Phân tích pattern nâng cao
    analyzeAdvancedPatterns(results, diceHistory) {
        if (results.length < 12) return null;
        
        const last12 = results.slice(-12);
        const patterns = this.detectAdvancedPatterns(last12);
        
        if (patterns.complexPattern) {
            return {
                prediction: patterns.prediction,
                confidence: patterns.confidence,
                method: patterns.description,
                score: patterns.prediction === 'TAI' ? 
                    { tai: patterns.score, xiu: -patterns.score } : 
                    { tai: -patterns.score, xiu: patterns.score }
            };
        }
        
        return null;
    }

    // Các hàm hỗ trợ
    getCurrentStreak(results) {
        if (results.length === 0) return { streak: 0, type: null };
        
        let streak = 1;
        const lastResult = results[results.length - 1];
        
        for (let i = results.length - 2; i >= 0; i--) {
            if (results[i] === lastResult) {
                streak++;
            } else {
                break;
            }
        }
        
        return { streak, type: lastResult };
    }

    checkPattern22(results) {
        if (results.length < 4) return { found: false };
        
        for (let i = 0; i <= results.length - 4; i++) {
            if (results[i] === results[i + 1] && 
                results[i + 2] === results[i + 3] &&
                results[i] !== results[i + 2]) {
                
                // Dự đoán tiếp theo
                const lastPair = results[i + 2];
                const prediction = lastPair === 'TAI' ? 'XIU' : 'TAI';
                
                return {
                    found: true,
                    pattern: `${results[i]}-${results[i]}-${results[i+2]}-${results[i+2]}`,
                    prediction
                };
            }
        }
        
        return { found: false };
    }

    findFibonacciPatterns(results) {
        const patterns = [];
        const maxLen = Math.min(8, results.length);
        
        for (let start = 0; start <= results.length - maxLen; start++) {
            const sequence = results.slice(start, start + maxLen);
            // Tìm các pattern đơn giản
            if (this.isFibonacciLike(sequence)) {
                patterns.push({
                    pattern: sequence,
                    start,
                    length: sequence.length
                });
            }
        }
        
        return patterns.sort((a, b) => b.length - a.length);
    }

    isFibonacciLike(sequence) {
        // Kiểm tra pattern lặp đơn giản
        if (sequence.length < 3) return false;
        
        // Pattern: A, B, A+B
        for (let i = 2; i < sequence.length; i++) {
            if (sequence[i] !== sequence[i-2] && sequence[i] !== sequence[i-1]) {
                // Không phải pattern đơn giản
                return false;
            }
        }
        
        return true;
    }

    predictNextFibonacci(pattern, allResults) {
        const seq = pattern.pattern;
        if (seq.length < 3) return null;
        
        // Dự đoán dựa trên 2 phần tử cuối
        const lastTwo = seq.slice(-2);
        if (lastTwo[0] === lastTwo[1]) {
            return lastTwo[0] === 'TAI' ? 'XIU' : 'TAI';
        } else {
            // Xen kẽ
            return lastTwo[1] === 'TAI' ? 'XIU' : 'TAI';
        }
    }

    findPeaks(arr) {
        const peaks = [];
        for (let i = 1; i < arr.length - 1; i++) {
            if (arr[i] > arr[i - 1] && arr[i] > arr[i + 1]) {
                peaks.push({ index: i, value: arr[i] });
            }
        }
        return peaks;
    }

    findValleys(arr) {
        const valleys = [];
        for (let i = 1; i < arr.length - 1; i++) {
            if (arr[i] < arr[i - 1] && arr[i] < arr[i + 1]) {
                valleys.push({ index: i, value: arr[i] });
            }
        }
        return valleys;
    }

    calculateGaps(results) {
        const gaps = { TAI: [], XIU: [] };
        let lastTai = -1, lastXiu = -1;
        
        for (let i = 0; i < results.length; i++) {
            if (results[i] === 'TAI') {
                if (lastTai !== -1) {
                    gaps.TAI.push(i - lastTai - 1);
                }
                lastTai = i;
            } else {
                if (lastXiu !== -1) {
                    gaps.XIU.push(i - lastXiu - 1);
                }
                lastXiu = i;
            }
        }
        
        const avgTai = gaps.TAI.length > 0 ? 
            gaps.TAI.reduce((a, b) => a + b, 0) / gaps.TAI.length : 0;
        const avgXiu = gaps.XIU.length > 0 ? 
            gaps.XIU.reduce((a, b) => a + b, 0) / gaps.XIU.length : 0;
        
        const lastType = results[results.length - 1];
        const currentGap = lastType === 'TAI' ? 
            (results.length - 1 - lastTai) : 
            (results.length - 1 - lastXiu);
        
        return {
            current: currentGap,
            average: (avgTai + avgXiu) / 2,
            lastType
        };
    }

    detectAdvancedPatterns(results) {
        // Kiểm tra pattern 3-2-1
        if (results.length >= 6) {
            const last6 = results.slice(-6);
            // Pattern: AAA BB C
            if (last6[0] === last6[1] && last6[1] === last6[2] &&
                last6[3] === last6[4] && last6[2] !== last6[3] &&
                last6[5] !== last6[4]) {
                
                return {
                    complexPattern: true,
                    prediction: last6[5] === 'TAI' ? 'XIU' : 'TAI',
                    confidence: 73,
                    description: 'Pattern 3-2-1 phức hợp',
                    score: 1.5
                };
            }
        }
        
        // Kiểm tra pattern gương (đối xứng)
        if (results.length >= 8) {
            const last8 = results.slice(-8);
            const first4 = last8.slice(0, 4);
            const last4 = last8.slice(4, 8);
            const reversedLast4 = [...last4].reverse();
            
            let matchCount = 0;
            for (let i = 0; i < 4; i++) {
                if (first4[i] === reversedLast4[i]) matchCount++;
            }
            
            if (matchCount >= 3) {
                return {
                    complexPattern: true,
                    prediction: last4[3] === 'TAI' ? 'XIU' : 'TAI',
                    confidence: 68,
                    description: 'Pattern đối xứng gương',
                    score: 1.2
                };
            }
        }
        
        return { complexPattern: false };
    }

    // Hàm tổng hợp dự đoán từ tất cả thuật toán
    predict(results, diceHistory, currentPhien = null) {
        if (results.length < 5) {
            return this.getDefaultPrediction();
        }
        
        const predictions = [];
        let totalScore = { tai: 0, xiu: 0 };
        
        // Chạy tất cả thuật toán
        for (const algorithm of this.algorithms) {
            try {
                const result = algorithm.call(this, results, diceHistory, currentPhien);
                if (result) {
                    predictions.push(result);
                    totalScore.tai += result.score?.tai || 0;
                    totalScore.xiu += result.score?.xiu || 0;
                }
            } catch (error) {
                console.error(`Algorithm error: ${algorithm.name}`, error);
            }
        }
        
        if (predictions.length === 0) {
            return this.getDefaultPrediction();
        }
        
        // Tính điểm trung bình
        const avgTaiScore = totalScore.tai / predictions.length;
        const avgXiuScore = totalScore.xiu / predictions.length;
        
        // Quyết định dự đoán cuối cùng
        let finalPrediction;
        let confidence;
        let method = "";
        
        if (avgTaiScore > avgXiuScore) {
            finalPrediction = 'TAI';
            confidence = Math.min(95, 50 + Math.abs(avgTaiScore - avgXiuScore) * 10);
        } else {
            finalPrediction = 'XIU';
            confidence = Math.min(95, 50 + Math.abs(avgXiuScore - avgTaiScore) * 10);
        }
        
        // Tạo mô tả phương pháp
        const topMethods = predictions
            .sort((a, b) => Math.abs(b.score?.tai || 0) - Math.abs(a.score?.tai || 0))
            .slice(0, 3)
            .map(p => p.method.split('→')[1]?.trim() || p.method);
        
        method = `Kết hợp ${predictions.length} thuật toán: ${topMethods.join(' | ')}`;
        
        // Tính tỷ lệ đồng thuận
        const agreeingCount = predictions.filter(p => 
            p.prediction === finalPrediction).length;
        const agreementRatio = Math.round((agreeingCount / predictions.length) * 100);
        
        return {
            prediction: finalPrediction,
            confidence: Math.round(confidence),
            method,
            detailedAnalysis: {
                totalAlgorithms: this.algorithms.length,
                algorithmsUsed: predictions.length,
                agreeingAlgorithms: agreeingCount,
                agreementRatio: agreementRatio,
                taiScore: avgTaiScore.toFixed(2),
                xiuScore: avgXiuScore.toFixed(2),
                scoreDifference: Math.abs(avgTaiScore - avgXiuScore).toFixed(2)
            },
            allPredictions: predictions
        };
    }

    getDefaultPrediction() {
        return {
            prediction: Math.random() > 0.5 ? 'TAI' : 'XIU',
            confidence: 50,
            method: 'Dữ liệu không đủ, dự đoán ngẫu nhiên',
            detailedAnalysis: {
                totalAlgorithms: this.algorithms.length,
                algorithmsUsed: 0,
                agreeingAlgorithms: 0,
                agreementRatio: 0,
                taiScore: '0.00',
                xiuScore: '0.00',
                scoreDifference: '0.00'
            }
        };
    }
}

// Hàm xử lý API Sunwin
async function fetchSunwinData() {
    try {
        const response = await axios.get(API_CONFIG.SUNWIN);
        return response.data;
    } catch (error) {
        console.error('Error fetching Sunwin data:', error.message);
        return null;
    }
}

// Hàm xử lý API LC79
async function fetchLC79Data() {
    try {
        const response = await axios.get(API_CONFIG.LC79);
        return response.data;
    } catch (error) {
        console.error('Error fetching LC79 data:', error.message);
        return null;
    }
}

// Xử lý dữ liệu Sunwin
function processSunwinData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) {
        return null;
    }
    
    // Sắp xếp theo phiên (giảm dần)
    const sortedData = [...rawData].sort((a, b) => b.phien - a.phien);
    
    // Lấy phiên gần nhất
    const latestSession = sortedData[0];
    
    // Chuẩn bị dữ liệu cho predictor
    const results = sortedData.map(session => 
        session.ket_qua === 'Tài' ? 'TAI' : 'XIU'
    ).reverse(); // Đảo ngược để thời gian tăng dần
    
    const diceHistory = sortedData.map(session => 
        [session.xuc_xac_1, session.xuc_xac_2, session.xuc_xac_3]
    ).reverse();
    
    return {
        latestSession,
        results,
        diceHistory,
        currentPhien: latestSession.phien
    };
}

// Xử lý dữ liệu LC79
function processLC79Data(rawData) {
    if (!rawData || !rawData.list || !Array.isArray(rawData.list)) {
        return null;
    }
    
    const sessions = rawData.list;
    
    // Sắp xếp theo ID (giảm dần)
    const sortedData = [...sessions].sort((a, b) => b.id - a.id);
    
    // Lấy phiên gần nhất
    const latestSession = sortedData[0];
    
    // Chuẩn bị dữ liệu cho predictor
    const results = sortedData.map(session => 
        session.resultTruyenThong
    ).reverse();
    
    const diceHistory = sortedData.map(session => 
        session.dices
    ).reverse();
    
    return {
        latestSession,
        results,
        diceHistory,
        currentPhien: latestSession.id
    };
}

// Tạo response theo định dạng yêu cầu
function createResponse(platform, processedData, prediction) {
    if (!processedData || !prediction) {
        return {
            success: false,
            error: 'Không đủ dữ liệu để dự đoán'
        };
    }
    
    const { latestSession, diceHistory } = processedData;
    
    // Xác định format dựa trên platform
    let previousSession, currentSession, nextSession, xucXacCuoi;
    
    if (platform === 'sunwin') {
        previousSession = {
            phien: latestSession.phien,
            xuc_xac_1: latestSession.xuc_xac_1,
            xuc_xac_2: latestSession.xuc_xac_2,
            xuc_xac_3: latestSession.xuc_xac_3,
            tong: latestSession.tong,
            ket_qua: latestSession.ket_qua
        };
        currentSession = latestSession.phien;
        nextSession = latestSession.phien + 1;
        xucXacCuoi = [latestSession.xuc_xac_1, latestSession.xuc_xac_2, latestSession.xuc_xac_3];
    } else { // lc79
        previousSession = {
            phien: latestSession.id,
            xuc_xac_1: latestSession.dices[0],
            xuc_xac_2: latestSession.dices[1],
            xuc_xac_3: latestSession.dices[2],
            tong: latestSession.point,
            ket_qua: latestSession.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu'
        };
        currentSession = latestSession.id;
        nextSession = latestSession.id + 1;
        xucXacCuoi = latestSession.dices;
    }
    
    // Xác định độ mạnh dựa trên confidence
    let doManh = 'TRUNG BÌNH';
    if (prediction.confidence >= 80) doManh = 'RẤT MẠNH';
    else if (prediction.confidence >= 70) doManh = 'MẠNH';
    else if (prediction.confidence <= 55) doManh = 'YẾU';
    
    // Chuyển đổi prediction sang tiếng Việt
    const duDoan = prediction.prediction === 'TAI' ? 'Tài' : 'Xỉu';
    
    return {
        success: true,
        data: {
            previous_session: previousSession,
            current_session: currentSession,
            next_session: nextSession,
            du_doan: duDoan,
            do_tin_cay: `${prediction.confidence}%`,
            do_manh: doManh,
            phuong_phap: prediction.method,
            thong_tin_bo_sung: {
                thuat_toan_su_dung: prediction.detailedAnalysis.algorithmsUsed,
                patterns_da_tai: processedData.results.length,
                diem_so: {
                    totalAlgorithms: prediction.detailedAnalysis.totalAlgorithms,
                    agreeingAlgorithms: prediction.detailedAnalysis.agreeingAlgorithms,
                    taiScore: prediction.detailedAnalysis.taiScore,
                    xiuScore: prediction.detailedAnalysis.xiuScore,
                    scoreDifference: prediction.detailedAnalysis.scoreDifference,
                    agreementRatio: prediction.detailedAnalysis.agreementRatio
                },
                xuc_xac_cuoi: xucXacCuoi
            }
        }
    };
}

// Endpoint Sunwin
app.get('/sunwin', async (req, res) => {
    try {
        // Kiểm tra cache (5 giây)
        const now = Date.now();
        if (cache.sunwin.data && (now - cache.sunwin.timestamp < 5000)) {
            return res.json(cache.predictions.sunwin);
        }
        
        // Lấy dữ liệu mới
        const rawData = await fetchSunwinData();
        if (!rawData) {
            return res.status(500).json({ 
                success: false, 
                error: 'Không thể lấy dữ liệu từ API Sunwin' 
            });
        }
        
        // Xử lý dữ liệu
        const processedData = processSunwinData(rawData);
        if (!processedData) {
            return res.status(500).json({ 
                success: false, 
                error: 'Dữ liệu Sunwin không hợp lệ' 
            });
        }
        
        // Dự đoán
        const predictor = new TaiXiuPredictor();
        const prediction = predictor.predict(
            processedData.results, 
            processedData.diceHistory,
            processedData.currentPhien
        );
        
        // Tạo response
        const response = createResponse('sunwin', processedData, prediction);
        
        // Lưu cache
        cache.sunwin = { data: rawData, timestamp: now };
        cache.predictions.sunwin = response;
        
        res.json(response);
    } catch (error) {
        console.error('Sunwin endpoint error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Lỗi server khi xử lý yêu cầu Sunwin' 
        });
    }
});

// Endpoint LC79
app.get('/lc79', async (req, res) => {
    try {
        // Kiểm tra cache (5 giây)
        const now = Date.now();
        if (cache.lc79.data && (now - cache.lc79.timestamp < 5000)) {
            return res.json(cache.predictions.lc79);
        }
        
        // Lấy dữ liệu mới
        const rawData = await fetchLC79Data();
        if (!rawData) {
            return res.status(500).json({ 
                success: false, 
                error: 'Không thể lấy dữ liệu từ API LC79' 
            });
        }
        
        // Xử lý dữ liệu
        const processedData = processLC79Data(rawData);
        if (!processedData) {
            return res.status(500).json({ 
                success: false, 
                error: 'Dữ liệu LC79 không hợp lệ' 
            });
        }
        
        // Dự đoán
        const predictor = new TaiXiuPredictor();
        const prediction = predictor.predict(
            processedData.results, 
            processedData.diceHistory,
            processedData.currentPhien
        );
        
        // Tạo response
        const response = createResponse('lc79', processedData, prediction);
        
        // Lưu cache
        cache.lc79 = { data: rawData, timestamp: now };
        cache.predictions.lc79 = response;
        
        res.json(response);
    } catch (error) {
        console.error('LC79 endpoint error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Lỗi server khi xử lý yêu cầu LC79' 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        cache: {
            sunwin: cache.sunwin.data ? 'available' : 'empty',
            lc79: cache.lc79.data ? 'available' : 'empty'
        }
    });
});

// Endpoint thống kê thuật toán
app.get('/stats', (req, res) => {
    const predictor = new TaiXiuPredictor();
    res.json({
        totalAlgorithms: predictor.algorithms.length,
        algorithmNames: predictor.algorithms.map(fn => fn.name),
        cacheStatus: {
            sunwin: cache.sunwin.data ? `Có dữ liệu (${new Date(cache.sunwin.timestamp).toLocaleTimeString()})` : 'Không có dữ liệu',
            lc79: cache.lc79.data ? `Có dữ liệu (${new Date(cache.lc79.timestamp).toLocaleTimeString()})` : 'Không có dữ liệu'
        }
    });
});

// Middleware xử lý lỗi 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint không tồn tại. Các endpoint có sẵn: /sunwin, /lc79, /health, /stats'
    });
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy trên port ${PORT}`);
    console.log(`Các endpoint có sẵn:`);
    console.log(`  GET /sunwin     - Dự đoán kết quả từ Sunwin`);
    console.log(`  GET /lc79       - Dự đoán kết quả từ LC79`);
    console.log(`  GET /health     - Kiểm tra tình trạng server`);
    console.log(`  GET /stats      - Xem thống kê thuật toán`);
});

// Tự động refresh cache mỗi phút
setInterval(async () => {
    try {
        console.log('Tự động refresh cache...');
        
        // Refresh Sunwin
        const sunwinData = await fetchSunwinData();
        if (sunwinData) {
            cache.sunwin = { data: sunwinData, timestamp: Date.now() };
            
            // Cập nhật prediction
            const processedSunwin = processSunwinData(sunwinData);
            if (processedSunwin) {
                const predictor = new TaiXiuPredictor();
                const prediction = predictor.predict(
                    processedSunwin.results,
                    processedSunwin.diceHistory,
                    processedSunwin.currentPhien
                );
                cache.predictions.sunwin = createResponse('sunwin', processedSunwin, prediction);
            }
        }
        
        // Refresh LC79
        const lc79Data = await fetchLC79Data();
        if (lc79Data) {
            cache.lc79 = { data: lc79Data, timestamp: Date.now() };
            
            // Cập nhật prediction
            const processedLC79 = processLC79Data(lc79Data);
            if (processedLC79) {
                const predictor = new TaiXiuPredictor();
                const prediction = predictor.predict(
                    processedLC79.results,
                    processedLC79.diceHistory,
                    processedLC79.currentPhien
                );
                cache.predictions.lc79 = createResponse('lc79', processedLC79, prediction);
            }
        }
        
        console.log('Cache đã được refresh:', new Date().toLocaleTimeString());
    } catch (error) {
        console.error('Lỗi khi refresh cache:', error.message);
    }
}, 60000); // Mỗi phút