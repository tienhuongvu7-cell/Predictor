
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==================== CONFIGURATION ====================
const CONFIG = {
    API: {
        SUNWIN: 'http://180.93.52.196:3001/api/his',
        LC79: 'https://wtxmd52.tele68.com/v1/txmd5/sessions'
    },
    RISK: {
        DAILY_STOP_LOSS: -0.03,    // -3%
        DAILY_TAKE_PROFIT: 0.02,   // +2%
        MAX_CONSECUTIVE_LOSSES: 5,
        BET_SIZE_PERCENT: 0.01,    // 1% bankroll
        MIN_EDGE: 0.02,            // Minimum 2% edge to bet
        KELLY_FRACTION: 0.1        // Use 10% of Kelly
    },
    DATA: {
        MIN_SESSIONS: 100,
        VALIDATION_WINDOW: 1000,
        CACHE_TTL: 15000,          // 15 seconds
        MAX_RETRIES: 3,
        RETRY_DELAY: 2000
    },
    BACKTEST: {
        TRAIN_SIZE: 500,
        TEST_SIZE: 100,
        WALK_FORWARD_STEP: 50
    }
};

// ==================== DATA STRUCTURES ====================
class ValidatedSession {
    constructor(phien, xuc_xac_1, xuc_xac_2, xuc_xac_3, tong, ket_qua, timestamp, source) {
        this.phien = parseInt(phien);
        this.xuc_xac_1 = parseInt(xuc_xac_1);
        this.xuc_xac_2 = parseInt(xuc_xac_2);
        this.xuc_xac_3 = parseInt(xuc_xac_3);
        this.tong = parseInt(tong);
        this.ket_qua = this.normalizeResult(ket_qua);
        this.timestamp = timestamp || new Date().toISOString();
        this.source = source;
        this.isTai = this.ket_qua === 'TAI';
        this.isXiu = this.ket_qua === 'XIU';
        this.dices = [this.xuc_xac_1, this.xuc_xac_2, this.xuc_xac_3].sort((a, b) => a - b);
        
        this.validate();
    }
    
    normalizeResult(result) {
        if (!result) return null;
        return result.toString()
            .trim()
            .toUpperCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^A-Z]/g, '');
    }
    
    validate() {
        // Validate dice values
        this.dices.forEach(dice => {
            if (dice < 1 || dice > 6) {
                throw new Error(`Invalid dice value: ${dice}`);
            }
        });
        
        // Validate sum
        const calculatedSum = this.xuc_xac_1 + this.xuc_xac_2 + this.xuc_xac_3;
        if (calculatedSum !== this.tong) {
            throw new Error(`Sum mismatch: ${calculatedSum} != ${this.tong}`);
        }
        
        // Validate result
        const expectedResult = this.tong >= 11 ? 'TAI' : 'XIU';
        if (this.ket_qua !== expectedResult) {
            throw new Error(`Result mismatch: ${this.ket_qua} != ${expectedResult} for sum ${this.tong}`);
        }
        
        return true;
    }
    
    toJSON() {
        return {
            phien: this.phien,
            xuc_xac_1: this.xuc_xac_1,
            xuc_xac_2: this.xuc_xac_2,
            xuc_xac_3: this.xuc_xac_3,
            tong: this.tong,
            ket_qua: this.ket_qua,
            timestamp: this.timestamp,
            source: this.source,
            isTai: this.isTai,
            isXiu: this.isXiu
        };
    }
}

class AlgorithmResult {
    constructor(algorithmId, pTai, signalStrength, reason, features = {}) {
        this.algorithmId = algorithmId;
        this.pTai = Math.max(0.01, Math.min(0.99, pTai)); // Clamp between 0.01 and 0.99
        this.signalStrength = signalStrength; // 0-1 scale
        this.reason = reason;
        this.features = features;
        this.confidence = Math.abs(this.pTai - 0.5) * 2; // Convert to 0-1 scale
    }
}

class BetDecision {
    constructor() {
        this.timestamp = new Date().toISOString();
        this.decision = 'NO_BET'; // 'BET_TAI', 'BET_XIU', 'NO_BET'
        this.pTai = 0.5;
        this.edge = 0;
        this.stake = 0;
        this.expectedValue = 0;
        this.kellyStake = 0;
        this.finalStake = 0;
        this.reason = '';
        this.algorithmsUsed = [];
        this.features = {};
    }
}

class PerformanceTracker {
    constructor() {
        this.dailyPnl = 0;
        this.dailyBets = 0;
        this.dailyWins = 0;
        this.consecutiveLosses = 0;
        this.bankroll = 10000; // Starting bankroll
        this.history = [];
        this.startTime = new Date();
        
        this.loadFromDisk();
    }
    
    recordBet(decision, actualResult, payout = 1.0) {
        const betRecord = {
            timestamp: decision.timestamp,
            decision: decision.decision,
            pTai: decision.pTai,
            edge: decision.edge,
            stake: decision.finalStake,
            actualResult: actualResult,
            won: false,
            pnl: 0
        };
        
        if (decision.decision === 'NO_BET') {
            betRecord.reason = 'No bet decision';
            this.history.push(betRecord);
            this.saveToDisk();
            return betRecord;
        }
        
        // Calculate win/loss
        const betOnTai = decision.decision === 'BET_TAI';
        const actualIsTai = actualResult === 'TAI';
        betRecord.won = betOnTai === actualIsTai;
        
        if (betRecord.won) {
            betRecord.pnl = decision.finalStake * (payout - 1);
            this.dailyWins++;
        } else {
            betRecord.pnl = -decision.finalStake;
            this.consecutiveLosses++;
        }
        
        this.dailyPnl += betRecord.pnl;
        this.dailyBets++;
        this.bankroll += betRecord.pnl;
        
        if (!betRecord.won) {
            this.consecutiveLosses++;
        } else {
            this.consecutiveLosses = 0;
        }
        
        this.history.push(betRecord);
        this.saveToDisk();
        
        return betRecord;
    }
    
    shouldStopTrading() {
        // Check daily stop loss
        if (this.dailyPnl / this.bankroll <= CONFIG.RISK.DAILY_STOP_LOSS) {
            return { shouldStop: true, reason: `Daily stop loss reached: ${(this.dailyPnl/this.bankroll*100).toFixed(2)}%` };
        }
        
        // Check daily take profit
        if (this.dailyPnl / this.bankroll >= CONFIG.RISK.DAILY_TAKE_PROFIT) {
            return { shouldStop: true, reason: `Daily take profit reached: ${(this.dailyPnl/this.bankroll*100).toFixed(2)}%` };
        }
        
        // Check consecutive losses
        if (this.consecutiveLosses >= CONFIG.RISK.MAX_CONSECUTIVE_LOSSES) {
            return { shouldStop: true, reason: `Max consecutive losses: ${this.consecutiveLosses}` };
        }
        
        return { shouldStop: false, reason: '' };
    }
    
    getKellyStake(pWin, odds = 1.0) {
        const pLose = 1 - pWin;
        const b = odds - 1; // For even odds (1:1), b = 1
        const kelly = (b * pWin - pLose) / b;
        return Math.max(0, kelly * CONFIG.RISK.KELLY_FRACTION); // Fractional Kelly
    }
    
    async saveToDisk() {
        try {
            const data = {
                dailyPnl: this.dailyPnl,
                dailyBets: this.dailyBets,
                dailyWins: this.dailyWins,
                consecutiveLosses: this.consecutiveLosses,
                bankroll: this.bankroll,
                startTime: this.startTime,
                history: this.history.slice(-1000) // Keep last 1000 records
            };
            
            await fs.writeFile(
                path.join(__dirname, 'performance.json'),
                JSON.stringify(data, null, 2)
            );
        } catch (error) {
            console.error('Failed to save performance data:', error.message);
        }
    }
    
    async loadFromDisk() {
        try {
            const data = await fs.readFile(
                path.join(__dirname, 'performance.json'),
                'utf8'
            );
            const saved = JSON.parse(data);
            
            this.dailyPnl = saved.dailyPnl || 0;
            this.dailyBets = saved.dailyBets || 0;
            this.dailyWins = saved.dailyWins || 0;
            this.consecutiveLosses = saved.consecutiveLosses || 0;
            this.bankroll = saved.bankroll || 10000;
            this.startTime = new Date(saved.startTime || new Date());
            this.history = saved.history || [];
        } catch (error) {
            console.log('No previous performance data found, starting fresh');
        }
    }
    
    getMetrics() {
        const totalBets = this.history.filter(h => h.decision !== 'NO_BET').length;
        const winningBets = this.history.filter(h => h.won).length;
        const winRate = totalBets > 0 ? (winningBets / totalBets * 100).toFixed(2) : 0;
        
        const recentHistory = this.history.slice(-100);
        const recentBets = recentHistory.filter(h => h.decision !== 'NO_BET').length;
        const recentWins = recentHistory.filter(h => h.won).length;
        const recentWinRate = recentBets > 0 ? (recentWins / recentBets * 100).toFixed(2) : 0;
        
        return {
            bankroll: this.bankroll.toFixed(2),
            dailyPnl: this.dailyPnl.toFixed(2),
            dailyBets: this.dailyBets,
            dailyWinRate: this.dailyBets > 0 ? (this.dailyWins / this.dailyBets * 100).toFixed(2) : 0,
            totalBets,
            winRate: `${winRate}%`,
            recentWinRate: `${recentWinRate}%`,
            consecutiveLosses: this.consecutiveLosses,
            shouldStop: this.shouldStopTrading().shouldStop
        };
    }
}

// ==================== DATA PIPELINE ====================
class DataPipeline {
    constructor() {
        this.sessions = new Map(); // key: source_phien
        this.sources = new Set();
        this.biasDetector = new BiasDetector();
        this.validationErrors = [];
        this.eventEmitter = new EventEmitter();
    }
    
    addSession(rawData, source) {
        try {
            const session = new ValidatedSession(
                rawData.phien || rawData.id,
                rawData.xuc_xac_1 || rawData.dices?.[0],
                rawData.xuc_xac_2 || rawData.dices?.[1],
                rawData.xuc_xac_3 || rawData.dices?.[2],
                rawData.tong || rawData.point,
                rawData.ket_qua || rawData.resultTruyenThong,
                new Date().toISOString(),
                source
            );
            
            const key = `${source}_${session.phien}`;
            
            // Deduplication
            if (this.sessions.has(key)) {
                return false;
            }
            
            this.sessions.set(key, session);
            this.sources.add(source);
            
            // Update bias detector
            this.biasDetector.addSession(session);
            
            // Emit event for logging
            this.eventEmitter.emit('session_added', {
                session: session.toJSON(),
                source: source,
                totalSessions: this.sessions.size
            });
            
            return true;
        } catch (error) {
            this.validationErrors.push({
                rawData,
                source,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            console.warn(`Validation error for ${source}:`, error.message);
            return false;
        }
    }
    
    getSessions(source = null, limit = 100, reverse = true) {
        let sessions = Array.from(this.sessions.values());
        
        if (source) {
            sessions = sessions.filter(s => s.source === source);
        }
        
        // Sort by phien descending (newest first)
        sessions.sort((a, b) => b.phien - a.phien);
        
        if (reverse) {
            sessions = sessions.slice(0, limit);
            // Reverse for analysis (oldest first for pattern recognition)
            sessions.reverse();
        }
        
        return sessions;
    }
    
    getLatestSession(source = null) {
        const sessions = this.getSessions(source, 1, false);
        return sessions[0] || null;
    }
    
    async saveToDisk() {
        try {
            const data = {
                sessions: Array.from(this.sessions.values()).map(s => s.toJSON()),
                sources: Array.from(this.sources),
                validationErrors: this.validationErrors.slice(-100),
                timestamp: new Date().toISOString()
            };
            
            await fs.writeFile(
                path.join(__dirname, 'data_pipeline.json'),
                JSON.stringify(data, null, 2)
            );
        } catch (error) {
            console.error('Failed to save data pipeline:', error.message);
        }
    }
    
    async loadFromDisk() {
        try {
            const data = await fs.readFile(
                path.join(__dirname, 'data_pipeline.json'),
                'utf8'
            );
            const saved = JSON.parse(data);
            
            saved.sessions.forEach(sessionData => {
                try {
                    const session = new ValidatedSession(
                        sessionData.phien,
                        sessionData.xuc_xac_1,
                        sessionData.xuc_xac_2,
                        sessionData.xuc_xac_3,
                        sessionData.tong,
                        sessionData.ket_qua,
                        sessionData.timestamp,
                        sessionData.source
                    );
                    
                    const key = `${sessionData.source}_${session.phien}`;
                    this.sessions.set(key, session);
                    this.sources.add(sessionData.source);
                } catch (error) {
                    console.warn('Failed to load session:', error.message);
                }
            });
            
            this.validationErrors = saved.validationErrors || [];
            console.log(`Loaded ${this.sessions.size} sessions from disk`);
        } catch (error) {
            console.log('No previous data found, starting fresh');
        }
    }
    
    getStats() {
        const sessionsBySource = {};
        this.sources.forEach(source => {
            sessionsBySource[source] = this.getSessions(source).length;
        });
        
        return {
            totalSessions: this.sessions.size,
            sessionsBySource,
            validationErrors: this.validationErrors.length,
            biasStatus: this.biasDetector.getStatus()
        };
    }
}

// ==================== BIAS DETECTOR ====================
class BiasDetector {
    constructor() {
        this.sessions = [];
        this.sumDistribution = new Array(19).fill(0); // 3-18
        this.diceDistribution = new Array(7).fill(0); // 1-6
        this.resultDistribution = { TAI: 0, XIU: 0 };
        this.windowSize = 1000;
    }
    
    addSession(session) {
        this.sessions.push(session);
        
        // Update distributions
        this.sumDistribution[session.tong]++;
        session.dices.forEach(dice => {
            this.diceDistribution[dice]++;
        });
        this.resultDistribution[session.ket_qua]++;
        
        // Keep only window size
        if (this.sessions.length > this.windowSize) {
            const removed = this.sessions.shift();
            this.sumDistribution[removed.tong]--;
            removed.dices.forEach(dice => {
                this.diceDistribution[dice]--;
            });
            this.resultDistribution[removed.ket_qua]--;
        }
    }
    
    calculateChiSquare(observed, expected) {
        let chiSquare = 0;
        for (let i = 0; i < observed.length; i++) {
            if (expected[i] > 0) {
                chiSquare += Math.pow(observed[i] - expected[i], 2) / expected[i];
            }
        }
        return chiSquare;
    }
    
    getExpectedSumDistribution() {
        // Theoretical distribution for 3 dice
        const expected = new Array(19).fill(0);
        for (let i = 1; i <= 6; i++) {
            for (let j = 1; j <= 6; j++) {
                for (let k = 1; k <= 6; k++) {
                    expected[i + j + k]++;
                }
            }
        }
        
        // Normalize
        const total = 216; // 6^3
        return expected.map(e => e / total * this.sessions.length);
    }
    
    getExpectedDiceDistribution() {
        const expected = new Array(7).fill(0);
        const totalDice = this.sessions.length * 3;
        
        // Each dice should have equal probability
        for (let i = 1; i <= 6; i++) {
            expected[i] = totalDice / 6;
        }
        
        return expected;
    }
    
    detectBias() {
        if (this.sessions.length < 100) {
            return { hasBias: false, confidence: 0, details: 'Insufficient data' };
        }
        
        const biases = [];
        
        // Check sum distribution
        const observedSums = this.sumDistribution.slice(3);
        const expectedSums = this.getExpectedSumDistribution().slice(3);
        const sumChiSquare = this.calculateChiSquare(observedSums, expectedSums);
        const sumDF = 15; // 16 sums - 1
        const sumPValue = this.chiSquarePValue(sumChiSquare, sumDF);
        
        if (sumPValue < 0.05) {
            biases.push({
                type: 'SUM_DISTRIBUTION',
                pValue: sumPValue,
                chiSquare: sumChiSquare,
                message: `Sum distribution differs from expected (p=${sumPValue.toFixed(4)})`
            });
        }
        
        // Check dice distribution
        const observedDice = this.diceDistribution.slice(1);
        const expectedDice = this.getExpectedDiceDistribution().slice(1);
        const diceChiSquare = this.calculateChiSquare(observedDice, expectedDice);
        const diceDF = 5; // 6 faces - 1
        const dicePValue = this.chiSquarePValue(diceChiSquare, diceDF);
        
        if (dicePValue < 0.05) {
            biases.push({
                type: 'DICE_DISTRIBUTION',
                pValue: dicePValue,
                chiSquare: diceChiSquare,
                message: `Dice distribution differs from expected (p=${dicePValue.toFixed(4)})`
            });
        }
        
        // Check result distribution (should be ~50/50 for fair dice)
        const totalResults = this.resultDistribution.TAI + this.resultDistribution.XIU;
        const expectedTai = totalResults * 0.5;
        const observedTai = this.resultDistribution.TAI;
        const resultChiSquare = Math.pow(observedTai - expectedTai, 2) / expectedTai +
                               Math.pow(totalResults - observedTai - expectedTai, 2) / expectedTai;
        const resultPValue = this.chiSquarePValue(resultChiSquare, 1);
        
        if (resultPValue < 0.05) {
            const taiRatio = observedTai / totalResults;
            biases.push({
                type: 'RESULT_DISTRIBUTION',
                pValue: resultPValue,
                chiSquare: resultChiSquare,
                taiRatio: taiRatio,
                message: `Result bias detected: TAI ${(taiRatio*100).toFixed(1)}% (p=${resultPValue.toFixed(4)})`
            });
        }
        
        // Check for temporal drift (rolling window)
        if (this.sessions.length >= 200) {
            const firstHalf = this.sessions.slice(0, 100);
            const secondHalf = this.sessions.slice(-100);
            
            const firstTai = firstHalf.filter(s => s.isTai).length;
            const secondTai = secondHalf.filter(s => s.isTai).length;
            
            const zScore = Math.abs(firstTai - secondTai) / Math.sqrt(100 * 0.5 * 0.5);
            const driftPValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
            
            if (driftPValue < 0.05) {
                biases.push({
                    type: 'TEMPORAL_DRIFT',
                    pValue: driftPValue,
                    zScore: zScore,
                    message: `Temporal drift detected (z=${zScore.toFixed(2)}, p=${driftPValue.toFixed(4)})`
                });
            }
        }
        
        return {
            hasBias: biases.length > 0,
            confidence: biases.length > 0 ? 0.7 : 0.3,
            details: biases,
            sampleSize: this.sessions.length
        };
    }
    
    chiSquarePValue(chiSquare, df) {
        // Approximation using incomplete gamma function
        const logGamma = (z) => {
            const g = 7;
            const p = [
                0.99999999999980993, 676.5203681218851, -1259.1392167224028,
                771.32342877765313, -176.61502916214059, 12.507343278686905,
                -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
            ];
            
            if (z < 0.5) {
                return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
            }
            
            z -= 1;
            let x = p[0];
            for (let i = 1; i < g + 2; i++) {
                x += p[i] / (z + i);
            }
            const t = z + g + 0.5;
            return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
        };
        
        const upperGamma = (a, x) => {
            const logGammaA = logGamma(a);
            let term = Math.exp(-x + a * Math.log(x) - logGammaA);
            let sum = term;
            for (let n = 1; n < 1000; n++) {
                term *= x / (a + n);
                const prev = sum;
                sum += term;
                if (Math.abs(sum - prev) < 1e-10) break;
            }
            return sum;
        };
        
        const p = upperGamma(df / 2, chiSquare / 2);
        return Math.max(0, Math.min(1, p));
    }
    
    normalCDF(x) {
        // Approximation of normal CDF
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - prob : prob;
    }
    
    getStatus() {
        const bias = this.detectBias();
        return {
            sampleSize: this.sessions.length,
            hasBias: bias.hasBias,
            confidence: bias.confidence,
            taiRatio: this.resultDistribution.TAI / Math.max(1, this.sessions.length),
            details: bias.details.slice(0, 3)
        };
    }
}

// ==================== ALGORITHMS (PROBABILITY-BASED) ====================
class BaseAlgorithm {
    constructor(id, name, minSessions = 5) {
        this.id = id;
        this.name = name;
        this.minSessions = minSessions;
    }
    
    analyze(sessions) {
        if (sessions.length < this.minSessions) {
            return new AlgorithmResult(
                this.id,
                0.5,
                0,
                `Insufficient data: ${sessions.length}/${this.minSessions} sessions`
            );
        }
        
        return this._analyze(sessions);
    }
    
    _analyze(sessions) {
        throw new Error('Subclasses must implement _analyze method');
    }
    
    // Feature extraction helpers
    extractStreak(sessions) {
        let streak = 1;
        const firstType = sessions[0].isTai;
        
        for (let i = 1; i < Math.min(sessions.length, 10); i++) {
            if (sessions[i].isTai === firstType) {
                streak++;
            } else {
                break;
            }
        }
        
        return {
            length: streak,
            type: firstType ? 'TAI' : 'XIU'
        };
    }
    
    extractRecentStats(sessions, window = 10) {
        const recent = sessions.slice(0, window);
        const taiCount = recent.filter(s => s.isTai).length;
        const avgSum = recent.reduce((sum, s) => sum + s.tong, 0) / recent.length;
        const sumStd = Math.sqrt(
            recent.reduce((variance, s) => variance + Math.pow(s.tong - avgSum, 2), 0) / recent.length
        );
        
        return {
            taiRatio: taiCount / recent.length,
            avgSum,
            sumStd,
            window
        };
    }
}

class StreakAlgorithm extends BaseAlgorithm {
    constructor() {
        super(1, 'Streak Analysis', 5);
        this.streakWeights = {
            3: 0.55,
            4: 0.60,
            5: 0.65,
            6: 0.70,
            7: 0.75,
            8: 0.80
        };
    }
    
    _analyze(sessions) {
        const streak = this.extractStreak(sessions);
        
        if (streak.length < 3) {
            return new AlgorithmResult(
                this.id,
                0.5,
                0,
                `Streak too short: ${streak.length}`
            );
        }
        
        // Probability of streak continuing decreases with length
        const baseProb = streak.type === 'TAI' ? 0.5 : 0.5;
        const streakWeight = this.streakWeights[streak.length] || 0.5;
        
        // Bayesian adjustment: P(continue) = P(continue|streak) * P(streak)
        const pContinue = 0.5 * Math.pow(0.5, streak.length - 1); // Geometric distribution
        const pBreak = 1 - pContinue;
        
        // If streak is long, higher probability of breaking
        const pTai = streak.type === 'TAI' ? pBreak : pContinue;
        
        return new AlgorithmResult(
            this.id,
            pTai,
            Math.min(0.8, streak.length / 10),
            `Streak ${streak.type} for ${streak.length} rounds`,
            { streakLength: streak.length, streakType: streak.type }
        );
    }
}

class PatternAlgorithm extends BaseAlgorithm {
    constructor() {
        super(2, 'Pattern Recognition', 10);
    }
    
    _analyze(sessions) {
        // Convert to pattern string
        const pattern = sessions.slice(0, 10).map(s => s.isTai ? 'T' : 'X').join('');
        
        // Markov chain analysis
        const transitions = { 'T->T': 0, 'T->X': 0, 'X->X': 0, 'X->T': 0 };
        
        for (let i = 0; i < pattern.length - 1; i++) {
            const transition = `${pattern[i]}->${pattern[i+1]}`;
            transitions[transition]++;
        }
        
        const lastIsTai = sessions[0].isTai;
        const sameTrans = lastIsTai ? transitions['T->T'] : transitions['X->X'];
        const diffTrans = lastIsTai ? transitions['T->X'] : transitions['X->T'];
        const totalTrans = sameTrans + diffTrans;
        
        if (totalTrans === 0) {
            return new AlgorithmResult(
                this.id,
                0.5,
                0,
                'Insufficient pattern data'
            );
        }
        
        const pSame = sameTrans / totalTrans;
        const pTai = lastIsTai ? pSame : (1 - pSame);
        
        // Add Laplace smoothing
        const smoothedPTai = (sameTrans + 1) / (totalTrans + 2);
        
        return new AlgorithmResult(
            this.id,
            smoothedPTai,
            Math.abs(pTai - 0.5) * 2,
            `Markov: P(same)=${pSame.toFixed(3)}, smoothed=${smoothedPTai.toFixed(3)}`,
            { pSame, totalTrans, pattern: pattern.substring(0, 5) }
        );
    }
}

class SumAnalysisAlgorithm extends BaseAlgorithm {
    constructor() {
        super(3, 'Sum Analysis', 8);
    }
    
    _analyze(sessions) {
        const stats = this.extractRecentStats(sessions, 8);
        const lastSum = sessions[0].tong;
        
        // Historical sum reversion
        const sumDeviations = [];
        for (let i = 0; i < Math.min(sessions.length, 20); i++) {
            sumDeviations.push(Math.abs(sessions[i].tong - 10.5));
        }
        
        const avgDeviation = sumDeviations.reduce((a, b) => a + b, 0) / sumDeviations.length;
        const currentDeviation = Math.abs(lastSum - 10.5);
        
        // Mean reversion probability
        let pTai = 0.5;
        
        if (lastSum <= 8) {
            // Low sum, likely to increase
            pTai = 0.6 + (8 - lastSum) * 0.05;
        } else if (lastSum >= 13) {
            // High sum, likely to decrease
            pTai = 0.4 - (lastSum - 13) * 0.05;
        } else if (currentDeviation > avgDeviation * 1.5) {
            // Extreme deviation, strong mean reversion
            pTai = lastSum < 10.5 ? 0.65 : 0.35;
        } else if (stats.avgSum < 9.5) {
            // Consistently low sums
            pTai = 0.55;
        } else if (stats.avgSum > 11.5) {
            // Consistently high sums
            pTai = 0.45;
        }
        
        // Clamp probabilities
        pTai = Math.max(0.3, Math.min(0.7, pTai));
        
        return new AlgorithmResult(
            this.id,
            pTai,
            Math.abs(pTai - 0.5) * 2,
            `Sum analysis: last=${lastSum}, avg=${stats.avgSum.toFixed(2)}, dev=${currentDeviation.toFixed(2)}`,
            { lastSum, avgSum: stats.avgSum, currentDeviation }
        );
    }
}

class DicePatternAlgorithm extends BaseAlgorithm {
    constructor() {
        super(4, 'Dice Pattern', 5);
    }
    
    _analyze(sessions) {
        const lastSession = sessions[0];
        const dices = lastSession.dices;
        
        // Analyze dice patterns
        const diceCount = {};
        dices.forEach(d => {
            diceCount[d] = (diceCount[d] || 0) + 1;
        });
        
        const maxSame = Math.max(...Object.values(diceCount));
        const hasPair = maxSame >= 2;
        const hasTriple = maxSame === 3;
        
        let pTai = 0.5;
        let reason = 'Normal dice distribution';
        
        if (hasTriple) {
            // Triples often break patterns
            pTai = lastSession.isTai ? 0.4 : 0.6;
            reason = `Triple ${dices[0]}s detected`;
        } else if (hasPair) {
            const pairValue = Object.keys(diceCount).find(k => diceCount[k] >= 2);
            if (pairValue <= 3) {
                pTai = 0.55; // Low pair, slightly favor TAI
                reason = `Low pair (${pairValue}s)`;
            } else {
                pTai = 0.45; // High pair, slightly favor XIU
                reason = `High pair (${pairValue}s)`;
            }
        } else {
            // All different, check sum
            if (lastSession.tong <= 8) {
                pTai = 0.6;
                reason = 'All different, low sum';
            } else if (lastSession.tong >= 13) {
                pTai = 0.4;
                reason = 'All different, high sum';
            }
        }
        
        return new AlgorithmResult(
            this.id,
            pTai,
            hasTriple ? 0.7 : (hasPair ? 0.5 : 0.3),
            reason,
            { hasPair, hasTriple, diceValues: dices }
        );
    }
}

class StatisticalBiasAlgorithm extends BaseAlgorithm {
    constructor() {
        super(5, 'Statistical Bias', 20);
    }
    
    _analyze(sessions) {
        const window = Math.min(sessions.length, 50);
        const recent = sessions.slice(0, window);
        
        const taiCount = recent.filter(s => s.isTai).length;
        const taiRatio = taiCount / window;
        
        // Bayesian inference with beta prior
        const alpha = 2; // Prior successes
        const beta = 2;  // Prior failures
        const posteriorAlpha = alpha + taiCount;
        const posteriorBeta = beta + (window - taiCount);
        
        // Expected value of beta distribution
        const expectedPTai = posteriorAlpha / (posteriorAlpha + posteriorBeta);
        
        // Calculate credible interval
        const variance = (posteriorAlpha * posteriorBeta) / 
                        Math.pow(posteriorAlpha + posteriorBeta, 2) / 
                        (posteriorAlpha + posteriorBeta + 1);
        const stdDev = Math.sqrt(variance);
        
        const confidence = Math.min(0.8, 1 - (stdDev * 3)); // 3 sigma
        
        return new AlgorithmResult(
            this.id,
            expectedPTai,
            confidence,
            `Statistical bias: TAI ${(taiRatio*100).toFixed(1)}% in ${window} rounds, posterior=${expectedPTai.toFixed(3)}`,
            { taiRatio, window, posteriorAlpha, posteriorBeta }
        );
    }
}

class TemporalAlgorithm extends BaseAlgorithm {
    constructor() {
        super(6, 'Temporal Analysis', 15);
        this.hourlyPatterns = new Map();
    }
    
    _analyze(sessions) {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        
        // Analyze recent temporal patterns (last 2 hours equivalent)
        const recent = sessions.slice(0, 30);
        const hourlyStats = {};
        
        for (let i = 0; i < 24; i++) {
            hourlyStats[i] = { tai: 0, total: 0 };
        }
        
        // This would ideally use timestamp from sessions
        // For now, we'll use position as proxy
        recent.forEach((session, idx) => {
            const virtualHour = (hour - Math.floor(idx / 2.5)) % 24;
            if (session.isTai) {
                hourlyStats[virtualHour].tai++;
            }
            hourlyStats[virtualHour].total++;
        });
        
        // Calculate hourly bias
        const currentHourStats = hourlyStats[hour] || { tai: 0, total: 0 };
        let pTai = 0.5;
        let reason = 'No temporal pattern detected';
        
        if (currentHourStats.total >= 5) {
            const hourRatio = currentHourStats.tai / currentHourStats.total;
            if (Math.abs(hourRatio - 0.5) > 0.2) {
                pTai = hourRatio > 0.5 ? 0.45 : 0.55; // Revert to mean
                reason = `Hour ${hour}: TAI ${(hourRatio*100).toFixed(1)}% in ${currentHourStats.total} samples`;
            }
        }
        
        // Minute-based micro-patterns (last 15 minutes equivalent)
        if (minute < 15) {
            // Beginning of hour
            pTai = pTai * 0.9 + 0.5 * 0.1;
        } else if (minute > 45) {
            // End of hour
            pTai = pTai * 0.9 + 0.5 * 0.1;
        }
        
        return new AlgorithmResult(
            this.id,
            pTai,
            0.4,
            reason,
            { hour, currentHourStats }
        );
    }
}

// ==================== ENSEMBLE MODEL ====================
class EnsembleModel {
    constructor() {
        this.algorithms = [
            new StreakAlgorithm(),
            new PatternAlgorithm(),
            new SumAnalysisAlgorithm(),
            new DicePatternAlgorithm(),
            new StatisticalBiasAlgorithm(),
            new TemporalAlgorithm()
        ];
        
        this.weights = new Array(this.algorithms.length).fill(1);
        this.calibration = new CalibrationModel();
        this.performanceHistory = [];
        this.eventEmitter = new EventEmitter();
    }
    
    analyze(sessions) {
        const algorithmResults = [];
        const features = {};
        
        // Run all algorithms
        this.algorithms.forEach((algo, idx) => {
            try {
                const result = algo.analyze(sessions);
                algorithmResults.push(result);
                
                // Collect features
                features[`algo_${idx}_pTai`] = result.pTai;
                features[`algo_${idx}_strength`] = result.signalStrength;
            } catch (error) {
                console.warn(`Algorithm ${algo.id} failed:`, error.message);
            }
        });
        
        if (algorithmResults.length === 0) {
            return new AlgorithmResult(
                0,
                0.5,
                0,
                'No algorithms produced results'
            );
        }
        
        // Weighted average with calibration
        let weightedSum = 0;
        let weightSum = 0;
        
        algorithmResults.forEach((result, idx) => {
            const weight = this.weights[idx];
            const calibratedP = this.calibration.calibrate(result.pTai, idx);
            
            weightedSum += calibratedP * weight;
            weightSum += weight;
        });
        
        const pTai = weightSum > 0 ? weightedSum / weightSum : 0.5;
        
        // Calculate ensemble confidence
        const variances = algorithmResults.map(r => r.pTai * (1 - r.pTai));
        const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
        const ensembleVariance = avgVariance / algorithmResults.length;
        const confidence = Math.max(0, 1 - Math.sqrt(ensembleVariance * 4));
        
        // Build reason string
        const topAlgorithms = algorithmResults
            .sort((a, b) => Math.abs(b.pTai - 0.5) - Math.abs(a.pTai - 0.5))
            .slice(0, 3);
        
        const reasons = topAlgorithms.map(r => 
            `A${r.algorithmId}: ${r.reason.substring(0, 50)}`
        ).join(' | ');
        
        const result = new AlgorithmResult(
            99, // Ensemble ID
            pTai,
            confidence,
            reasons,
            { 
                algorithmResults: algorithmResults.map(r => ({ 
                    id: r.algorithmId, 
                    pTai: r.pTai,
                    strength: r.signalStrength 
                })),
                features
            }
        );
        
        // Emit for logging
        this.eventEmitter.emit('ensemble_analysis', {
            pTai: result.pTai,
            confidence: result.confidence,
            algorithmResults: algorithmResults.map(r => r.pTai),
            timestamp: new Date().toISOString()
        });
        
        return result;
    }
    
    updateWeights(actualResults) {
        // Simple reinforcement learning: increase weight for accurate algorithms
        this.algorithms.forEach((algo, idx) => {
            const predictions = this.performanceHistory
                .filter(h => h.algorithmId === algo.id)
                .slice(-50);
            
            if (predictions.length >= 20) {
                // Calculate Brier score
                const brierScore = predictions.reduce((score, pred) => {
                    const error = pred.pTai - (pred.actualResult === 'TAI' ? 1 : 0);
                    return score + error * error;
                }, 0) / predictions.length;
                
                // Update weight based on performance (lower Brier is better)
                this.weights[idx] = Math.max(0.1, Math.min(2.0, 1.0 / (brierScore + 0.1)));
            }
        });
        
        // Normalize weights
        const weightSum = this.weights.reduce((a, b) => a + b, 0);
        if (weightSum > 0) {
            this.weights = this.weights.map(w => w / weightSum * this.weights.length);
        }
    }
    
    recordResult(algorithmId, pTai, actualResult) {
        this.performanceHistory.push({
            algorithmId,
            pTai,
            actualResult,
            timestamp: new Date().toISOString()
        });
        
        // Keep only recent history
        if (this.performanceHistory.length > 1000) {
            this.performanceHistory = this.performanceHistory.slice(-500);
        }
        
        // Update calibration
        this.calibration.addSample(pTai, actualResult === 'TAI');
        
        // Periodically update weights
        if (this.performanceHistory.length % 100 === 0) {
            this.updateWeights();
        }
    }
}

class CalibrationModel {
    constructor() {
        this.bins = new Array(10).fill().map(() => ({ total: 0, positive: 0 }));
        this.samples = [];
    }
    
    addSample(predicted, actual) {
        const binIndex = Math.min(9, Math.floor(predicted * 10));
        this.bins[binIndex].total++;
        if (actual) this.bins[binIndex].positive++;
        
        this.samples.push({ predicted, actual });
        
        if (this.samples.length > 1000) {
            this.samples = this.samples.slice(-500);
        }
    }
    
    calibrate(p, algorithmId = null) {
        if (this.samples.length < 100) return p;
        
        const binIndex = Math.min(9, Math.floor(p * 10));
        const bin = this.bins[binIndex];
        
        if (bin.total >= 10) {
            const calibrated = bin.positive / bin.total;
            // Blend with original prediction
            const weight = Math.min(0.7, bin.total / 100);
            return p * (1 - weight) + calibrated * weight;
        }
        
        return p;
    }
    
    getCalibrationCurve() {
        return this.bins.map((bin, idx) => ({
            bin: idx / 10,
            predicted: (idx + 0.5) / 10,
            actual: bin.total > 0 ? bin.positive / bin.total : 0,
            samples: bin.total
        }));
    }
}

// ==================== RISK ENGINE ====================
class RiskEngine {
    constructor(performanceTracker) {
        this.performanceTracker = performanceTracker;
        this.ensembleModel = new EnsembleModel();
        this.biasDetector = new BiasDetector();
        this.lastDecision = null;
        this.decisionHistory = [];
    }
    
    makeDecision(sessions, source) {
        const decision = new BetDecision();
        
        // Check if we should stop trading
        const stopCheck = this.performanceTracker.shouldStopTrading();
        if (stopCheck.shouldStop) {
            decision.decision = 'NO_BET';
            decision.reason = `Trading stopped: ${stopCheck.reason}`;
            this.lastDecision = decision;
            this.decisionHistory.push(decision);
            return decision;
        }
        
        // Check bias detection
        const biasStatus = this.biasDetector.getStatus();
        if (!biasStatus.hasBias && biasStatus.sampleSize > 500) {
            decision.decision = 'NO_BET';
            decision.reason = 'No statistical bias detected - edge likely non-existent';
            this.lastDecision = decision;
            this.decisionHistory.push(decision);
            return decision;
        }
        
        // Get ensemble prediction
        const analysis = this.ensembleModel.analyze(sessions);
        decision.pTai = analysis.pTai;
        decision.algorithmsUsed = analysis.features?.algorithmResults || [];
        
        // Calculate edge
        const pWin = decision.pTai > 0.5 ? decision.pTai : 1 - decision.pTai;
        decision.edge = Math.abs(pWin - 0.5);
        
        // No bet if edge too small
        if (decision.edge < CONFIG.RISK.MIN_EDGE) {
            decision.decision = 'NO_BET';
            decision.reason = `Edge too small: ${(decision.edge*100).toFixed(2)}% < ${(CONFIG.RISK.MIN_EDGE*100).toFixed(2)}%`;
            this.lastDecision = decision;
            this.decisionHistory.push(decision);
            return decision;
        }
        
        // Determine bet direction
        const betOnTai = decision.pTai > 0.5;
        decision.decision = betOnTai ? 'BET_TAI' : 'BET_XIU';
        
        // Calculate stakes
        const flatStake = this.performanceTracker.bankroll * CONFIG.RISK.BET_SIZE_PERCENT;
        const kellyStake = this.performanceTracker.getKellyStake(pWin, 1.0);
        
        decision.stake = flatStake;
        decision.kellyStake = kellyStake * this.performanceTracker.bankroll;
        decision.finalStake = Math.min(flatStake, decision.kellyStake);
        
        // Expected value
        decision.expectedValue = decision.finalStake * (pWin * 1.0 - (1 - pWin) * 1.0);
        
        // Build reason
        const edgePercent = (decision.edge * 100).toFixed(2);
        const pTaiPercent = (decision.pTai * 100).toFixed(1);
        decision.reason = `Edge: ${edgePercent}% | P(TAI): ${pTaiPercent}% | Stake: ${decision.finalStake.toFixed(2)} | ` +
                         `Bias: ${biasStatus.hasBias ? 'YES' : 'NO'} ${biasStatus.confidence > 0.6 ? '✓' : '?'}`;
        
        decision.features = {
            biasStatus,
            sampleSize: sessions.length,
            edge: decision.edge,
            bankroll: this.performanceTracker.bankroll
        };
        
        this.lastDecision = decision;
        this.decisionHistory.push(decision);
        
        // Keep history manageable
        if (this.decisionHistory.length > 100) {
            this.decisionHistory = this.decisionHistory.slice(-50);
        }
        
        return decision;
    }
    
    recordResult(actualResult, payout = 1.0) {
        if (!this.lastDecision) return null;
        
        const betRecord = this.performanceTracker.recordBet(this.lastDecision, actualResult, payout);
        
        // Update ensemble model with result
        this.lastDecision.algorithmsUsed.forEach(algoResult => {
            this.ensembleModel.recordResult(
                algoResult.id,
                algoResult.pTai,
                actualResult
            );
        });
        
        return betRecord;
    }
    
    getDecisionStats() {
        const recentDecisions = this.decisionHistory.slice(-50);
        const bets = recentDecisions.filter(d => d.decision !== 'NO_BET');
        const noBets = recentDecisions.filter(d => d.decision === 'NO_BET');
        
        const avgEdge = bets.length > 0 ? 
            bets.reduce((sum, d) => sum + d.edge, 0) / bets.length : 0;
        
        return {
            totalDecisions: recentDecisions.length,
            betRate: bets.length / recentDecisions.length,
            noBetRate: noBets.length / recentDecisions.length,
            avgEdge: (avgEdge * 100).toFixed(2) + '%',
            recentDecision: this.lastDecision?.decision || 'NONE',
            lastEdge: this.lastDecision ? (this.lastDecision.edge * 100).toFixed(2) + '%' : 'N/A'
        };
    }
}

// ==================== LOGGING SYSTEM ====================
class TradingLogger {
    constructor() {
        this.logFile = path.join(__dirname, 'trading_log.jsonl');
        this.sessionLogFile = path.join(__dirname, 'session_log.jsonl');
        this.ensureLogFiles();
    }
    
    ensureLogFiles() {
        [this.logFile, this.sessionLogFile].forEach(async (file) => {
            try {
                await fs.access(file);
            } catch {
                await fs.writeFile(file, '');
            }
        });
    }
    
    async logSession(session, source, analysis = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'SESSION',
            source,
            session: session.toJSON(),
            analysis: analysis ? {
                pTai: analysis.pTai,
                confidence: analysis.confidence,
                reason: analysis.reason
            } : null
        };
        
        await this.appendToFile(this.sessionLogFile, logEntry);
    }
    
    async logDecision(decision, sessions, source) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'DECISION',
            source,
            decision: {
                decision: decision.decision,
                pTai: decision.pTai,
                edge: decision.edge,
                stake: decision.finalStake,
                reason: decision.reason,
                algorithmsUsed: decision.algorithmsUsed
            },
            context: {
                recentSessions: sessions.slice(0, 5).map(s => ({
                    phien: s.phien,
                    tong: s.tong,
                    ket_qua: s.ket_qua
                })),
                sampleSize: sessions.length
            }
        };
        
        await this.appendToFile(this.logFile, logEntry);
    }
    
    async logResult(decision, actualResult, betRecord) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'RESULT',
            decision: decision.decision,
            predictedPTai: decision.pTai,
            actualResult,
            betRecord: {
                won: betRecord.won,
                pnl: betRecord.pnl,
                stake: betRecord.stake
            },
            performance: this.getPerformanceSnapshot()
        };
        
        await this.appendToFile(this.logFile, logEntry);
    }
    
    async logError(error, context) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'ERROR',
            error: error.message,
            stack: error.stack,
            context
        };
        
        await this.appendToFile(this.logFile, logEntry);
    }
    
    async appendToFile(file, data) {
        try {
            await fs.appendFile(file, JSON.stringify(data) + '\n');
        } catch (error) {
            console.error('Failed to write log:', error.message);
        }
    }
    
    getPerformanceSnapshot() {
        // This would be populated by the performance tracker
        return {
            timestamp: new Date().toISOString()
        };
    }
    
    async getRecentLogs(limit = 100, type = null) {
        try {
            const content = await fs.readFile(this.logFile, 'utf8');
            const lines = content.trim().split('\n').filter(line => line);
            
            let logs = lines.map(line => JSON.parse(line));
            
            if (type) {
                logs = logs.filter(log => log.type === type);
            }
            
            return logs.slice(-limit);
        } catch (error) {
            return [];
        }
    }
}

// ==================== BACKTEST ENGINE ====================
class BacktestEngine {
    constructor() {
        this.results = [];
        this.metrics = {};
    }
    
    async runWalkForward(sessions, trainSize = 500, testSize = 100, step = 50) {
        const totalSessions = sessions.length;
        const results = [];
        
        for (let start = 0; start + trainSize + testSize <= totalSessions; start += step) {
            const trainData = sessions.slice(start, start + trainSize);
            const testData = sessions.slice(start + trainSize, start + trainSize + testSize);
            
            const testResult = await this.runSingleTest(trainData, testData);
            results.push({
                window: start,
                ...testResult
            });
            
            console.log(`Walk-forward window ${start}/${totalSessions}:`);
            console.log(`  Accuracy: ${(testResult.accuracy * 100).toFixed(2)}%`);
            console.log(`  Log Loss: ${testResult.logLoss.toFixed(4)}`);
            console.log(`  Profit: ${testResult.profit.toFixed(2)}`);
        }
        
        this.results = results;
        this.calculateMetrics();
        
        return this.metrics;
    }
    
    async runSingleTest(trainSessions, testSessions) {
        // Create a clean ensemble for testing
        const testEnsemble = new EnsembleModel();
        const testPerformance = new PerformanceTracker();
        testPerformance.bankroll = 10000;
        
        const riskEngine = new RiskEngine(testPerformance);
        
        let correct = 0;
        let total = 0;
        let logLoss = 0;
        let profit = 0;
        let bets = 0;
        
        // We need to simulate real-time analysis
        // For simplicity, we'll analyze each test session using all previous data
        for (let i = 0; i < testSessions.length; i++) {
            const testSession = testSessions[i];
            const historicalData = [...trainSessions, ...testSessions.slice(0, i)];
            
            // Sort historical data (newest first for analysis)
            historicalData.sort((a, b) => b.phien - a.phien);
            
            if (historicalData.length < 20) continue;
            
            // Make decision
            const decision = riskEngine.makeDecision(historicalData, 'backtest');
            
            if (decision.decision !== 'NO_BET') {
                const predictedTai = decision.pTai > 0.5;
                const actualTai = testSession.isTai;
                
                if (predictedTai === actualTai) correct++;
                total++;
                
                // Calculate log loss
                const pCorrect = actualTai ? decision.pTai : 1 - decision.pTai;
                logLoss += -Math.log(Math.max(pCorrect, 1e-10));
                
                bets++;
            }
            
            // Record result for learning
            riskEngine.recordResult(testSession.ket_qua, 1.0);
            profit = testPerformance.bankroll - 10000;
        }
        
        return {
            accuracy: total > 0 ? correct / total : 0,
            logLoss: total > 0 ? logLoss / total : 0,
            profit,
            bets,
            coverage: bets / testSessions.length,
            finalBankroll: testPerformance.bankroll
        };
    }
    
    calculateMetrics() {
        if (this.results.length === 0) return {};
        
        const accuracies = this.results.map(r => r.accuracy);
        const profits = this.results.map(r => r.profit);
        const coverages = this.results.map(r => r.coverage);
        
        const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
        const std = arr => {
            const avg = mean(arr);
            const variance = arr.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / arr.length;
            return Math.sqrt(variance);
        };
        
        this.metrics = {
            avgAccuracy: mean(accuracies),
            stdAccuracy: std(accuracies),
            avgProfit: mean(profits),
            stdProfit: std(profits),
            avgCoverage: mean(coverages),
            sharpeRatio: std(profits) > 0 ? mean(profits) / std(profits) * Math.sqrt(252) : 0,
            maxDrawdown: this.calculateMaxDrawdown(profits),
            winRate: this.results.filter(r => r.profit > 0).length / this.results.length
        };
        
        return this.metrics;
    }
    
    calculateMaxDrawdown(profits) {
        let maxDrawdown = 0;
        let peak = profits[0];
        
        for (let i = 1; i < profits.length; i++) {
            if (profits[i] > peak) {
                peak = profits[i];
            }
            
            const drawdown = (peak - profits[i]) / peak;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
        
        return maxDrawdown;
    }
    
    compareWithBaselines(sessions) {
        const baselines = [
            {
                name: 'Always TAI',
                strategy: (testData) => {
                    let correct = 0;
                    testData.forEach(session => {
                        if (session.isTai) correct++;
                    });
                    return correct / testData.length;
                }
            },
            {
                name: 'Always XIU',
                strategy: (testData) => {
                    let correct = 0;
                    testData.forEach(session => {
                        if (!session.isTai) correct++;
                    });
                    return correct / testData.length;
                }
            },
            {
                name: 'Random 50/50',
                strategy: (testData) => {
                    let correct = 0;
                    testData.forEach(() => {
                        if (Math.random() > 0.5) correct++;
                    });
                    return correct / testData.length;
                }
            },
            {
                name: 'Follow Previous',
                strategy: (testData) => {
                    let correct = 0;
                    for (let i = 1; i < testData.length; i++) {
                        if (testData[i].isTai === testData[i-1].isTai) correct++;
                    }
                    return correct / (testData.length - 1);
                }
            }
        ];
        
        const baselineResults = {};
        baselines.forEach(baseline => {
            // Use last 1000 sessions for baseline comparison
            const testData = sessions.slice(0, 1000);
            baselineResults[baseline.name] = baseline.strategy(testData);
        });
        
        return baselineResults;
    }
}

// ==================== MAIN APPLICATION ====================
class TaiXiuTradingSystem {
    constructor() {
        this.dataPipeline = new DataPipeline();
        this.performanceTracker = new PerformanceTracker();
        this.riskEngine = new RiskEngine(this.performanceTracker);
        this.logger = new TradingLogger();
        this.backtestEngine = new BacktestEngine();
        this.autoRefresh = new AutoRefreshSystem(this);
        this.isInitialized = false;
        
        // Statistics
        this.stats = {
            totalProcessed: 0,
            successfulPredictions: 0,
            totalBets: 0,
            lastUpdate: null
        };
    }
    
    async initialize() {
        try {
            // Load historical data
            await this.dataPipeline.loadFromDisk();
            
            // Initialize with existing data
            const sessions = this.dataPipeline.getSessions(null, 1000, false);
            if (sessions.length > 100) {
                console.log(`Initialized with ${sessions.length} historical sessions`);
            }
            
            this.isInitialized = true;
            console.log('Trading system initialized successfully');
            
            // Start auto-refresh
            this.autoRefresh.start();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize trading system:', error);
            return false;
        }
    }
    
    async processNewSession(rawData, source) {
        if (!this.isInitialized) {
            throw new Error('Trading system not initialized');
        }
        
        try {
            // Add to data pipeline
            const added = this.dataPipeline.addSession(rawData, source);
            if (!added) {
                return { success: false, reason: 'Duplicate session' };
            }
            
            const session = this.dataPipeline.getLatestSession(source);
            
            // Get recent sessions for analysis
            const recentSessions = this.dataPipeline.getSessions(source, 100);
            
            if (recentSessions.length < 20) {
                return { 
                    success: true, 
                    action: 'COLLECTING_DATA',
                    sessions: recentSessions.length,
                    required: 20 
                };
            }
            
            // Make trading decision
            const decision = this.riskEngine.makeDecision(recentSessions, source);
            
            // Log everything
            await this.logger.logSession(session, source);
            await this.logger.logDecision(decision, recentSessions, source);
            
            // Record result of previous decision if applicable
            if (this.riskEngine.lastDecision && this.riskEngine.lastDecision.decision !== 'NO_BET') {
                const betRecord = this.riskEngine.recordResult(session.ket_qua, 1.0);
                await this.logger.logResult(this.riskEngine.lastDecision, session.ket_qua, betRecord);
                
                // Update statistics
                this.stats.totalBets++;
                if (betRecord.won) {
                    this.stats.successfulPredictions++;
                }
            }
            
            // Save state periodically
            if (this.stats.totalProcessed % 10 === 0) {
                await this.dataPipeline.saveToDisk();
            }
            
            this.stats.totalProcessed++;
            this.stats.lastUpdate = new Date().toISOString();
            
            return {
                success: true,
                decision: decision.decision,
                pTai: decision.pTai,
                edge: decision.edge,
                stake: decision.finalStake,
                reason: decision.reason,
                performance: this.performanceTracker.getMetrics(),
                stats: this.stats
            };
            
        } catch (error) {
            await this.logger.logError(error, { source, rawData });
            console.error('Error processing session:', error);
            return { success: false, error: error.message };
        }
    }
    
    async runBacktest(source = null, sessions = null) {
        try {
            const testSessions = sessions || this.dataPipeline.getSessions(source, 2000, false);
            
            if (testSessions.length < 1000) {
                return { 
                    success: false, 
                    error: `Insufficient data: ${testSessions.length} sessions (need at least 1000)` 
                };
            }
            
            console.log(`Running backtest with ${testSessions.length} sessions...`);
            
            // Run walk-forward backtest
            const results = await this.backtestEngine.runWalkForward(
                testSessions,
                CONFIG.BACKTEST.TRAIN_SIZE,
                CONFIG.BACKTEST.TEST_SIZE,
                CONFIG.BACKTEST.WALK_FORWARD_STEP
            );
            
            // Compare with baselines
            const baselines = this.backtestEngine.compareWithBaselines(testSessions);
            
            return {
                success: true,
                metrics: results,
                baselines,
                interpretation: this.interpretBacktestResults(results, baselines)
            };
            
        } catch (error) {
            console.error('Backtest failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    interpretBacktestResults(metrics, baselines) {
        const interpretations = [];
        
        // Check if we beat baselines
        const bestBaseline = Math.max(...Object.values(baselines));
        if (metrics.avgAccuracy > bestBaseline) {
            interpretations.push(`✓ BEATS baselines (${(metrics.avgAccuracy*100).toFixed(2)}% vs ${(bestBaseline*100).toFixed(2)}%)`);
        } else {
            interpretations.push(`✗ DOES NOT beat baselines (${(metrics.avgAccuracy*100).toFixed(2)}% vs ${(bestBaseline*100).toFixed(2)}%)`);
        }
        
        // Check profitability
        if (metrics.avgProfit > 0) {
            interpretations.push(`✓ PROFITABLE (avg ${metrics.avgProfit.toFixed(2)} per test window)`);
        } else {
            interpretations.push(`✗ NOT PROFITABLE (avg ${metrics.avgProfit.toFixed(2)} per test window)`);
        }
        
        // Check Sharpe ratio
        if (metrics.sharpeRatio > 1) {
            interpretations.push(`✓ Good risk-adjusted returns (Sharpe: ${metrics.sharpeRatio.toFixed(2)})`);
        } else if (metrics.sharpeRatio > 0) {
            interpretations.push(`~ Moderate risk-adjusted returns (Sharpe: ${metrics.sharpeRatio.toFixed(2)})`);
        } else {
            interpretations.push(`✗ Poor risk-adjusted returns (Sharpe: ${metrics.sharpeRatio.toFixed(2)})`);
        }
        
        // Check coverage
        if (metrics.avgCoverage < 0.3) {
            interpretations.push(`~ Conservative (only bets ${(metrics.avgCoverage*100).toFixed(1)}% of time)`);
        } else if (metrics.avgCoverage > 0.7) {
            interpretations.push(`~ Aggressive (bets ${(metrics.avgCoverage*100).toFixed(1)}% of time)`);
        }
        
        return interpretations;
    }
    
    getSystemStatus() {
        const pipelineStats = this.dataPipeline.getStats();
        const performance = this.performanceTracker.getMetrics();
        const decisionStats = this.riskEngine.getDecisionStats();
        const biasStatus = this.dataPipeline.biasDetector.getStatus();
        
        return {
            system: {
                initialized: this.isInitialized,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            },
            data: pipelineStats,
            performance,
            decisions: decisionStats,
            bias: biasStatus,
            stats: this.stats
        };
    }
}

// ==================== AUTO REFRESH SYSTEM ====================
class AutoRefreshSystem {
    constructor(tradingSystem) {
        this.tradingSystem = tradingSystem;
        this.caches = {
            sunwin: { data: [], lastUpdate: null, stale: true },
            lc79: { data: [], lastUpdate: null, stale: true }
        };
        this.isRunning = false;
        this.retryCounts = {};
        this.eventEmitter = new EventEmitter();
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        
        // Initial refresh
        this.refreshAll();
        
        // Set up intervals
        this.sunwinInterval = setInterval(() => this.refreshSunwin(), CONFIG.DATA.CACHE_TTL);
        this.lc79Interval = setInterval(() => this.refreshLC79(), CONFIG.DATA.CACHE_TTL);
        
        // Health check interval
        this.healthInterval = setInterval(() => this.healthCheck(), 60000);
        
        console.log('Auto-refresh system started');
    }
    
    stop() {
        this.isRunning = false;
        
        if (this.sunwinInterval) clearInterval(this.sunwinInterval);
        if (this.lc79Interval) clearInterval(this.lc79Interval);
        if (this.healthInterval) clearInterval(this.healthInterval);
        
        console.log('Auto-refresh system stopped');
    }
    
    async refreshSunwin() {
        try {
            const response = await axios.get(CONFIG.API.SUNWIN, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response.data && Array.isArray(response.data)) {
                this.caches.sunwin.data = response.data;
                this.caches.sunwin.lastUpdate = new Date();
                this.caches.sunwin.stale = false;
                this.retryCounts.sunwin = 0;
                
                // Process each new session
                response.data.slice(0, 5).forEach(async (item) => {
                    await this.tradingSystem.processNewSession(item, 'sunwin');
                });
                
                this.eventEmitter.emit('refresh_success', { source: 'sunwin', count: response.data.length });
            }
        } catch (error) {
            console.error('Sunwin refresh failed:', error.message);
            this.caches.sunwin.stale = true;
            this.retryCounts.sunwin = (this.retryCounts.sunwin || 0) + 1;
            
            // Exponential backoff
            if (this.retryCounts.sunwin > 3) {
                const delay = Math.min(30000, 2000 * Math.pow(2, this.retryCounts.sunwin - 3));
                setTimeout(() => this.refreshSunwin(), delay);
            }
        }
    }
    
    async refreshLC79() {
        try {
            const response = await axios.get(CONFIG.API.LC79, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });
            
            if (response.data && response.data.list && Array.isArray(response.data.list)) {
                this.caches.lc79.data = response.data.list;
                this.caches.lc79.lastUpdate = new Date();
                this.caches.lc79.stale = false;
                this.retryCounts.lc79 = 0;
                
                // Process each new session
                response.data.list.slice(0, 5).forEach(async (item) => {
                    await this.tradingSystem.processNewSession({
                        id: item.id,
                        dices: item.dices,
                        point: item.point,
                        resultTruyenThong: item.resultTruyenThong
                    }, 'lc79');
                });
                
                this.eventEmitter.emit('refresh_success', { source: 'lc79', count: response.data.list.length });
            }
        } catch (error) {
            console.error('LC79 refresh failed:', error.message);
            this.caches.lc79.stale = true;
            this.retryCounts.lc79 = (this.retryCounts.lc79 || 0) + 1;
            
            // Exponential backoff
            if (this.retryCounts.lc79 > 3) {
                const delay = Math.min(30000, 2000 * Math.pow(2, this.retryCounts.lc79 - 3));
                setTimeout(() => this.refreshLC79(), delay);
            }
        }
    }
    
    async refreshAll() {
        await Promise.allSettled([
            this.refreshSunwin(),
            this.refreshLC79()
        ]);
    }
    
    healthCheck() {
        const now = new Date();
        const sunwinAge = this.caches.sunwin.lastUpdate ? 
            (now - this.caches.sunwin.lastUpdate) / 1000 : Infinity;
        const lc79Age = this.caches.lc79.lastUpdate ? 
            (now - this.caches.lc79.lastUpdate) / 1000 : Infinity;
        
        const status = {
            sunwin: {
                age: sunwinAge,
                stale: this.caches.sunwin.stale || sunwinAge > CONFIG.DATA.CACHE_TTL / 1000 * 2,
                retries: this.retryCounts.sunwin || 0
            },
            lc79: {
                age: lc79Age,
                stale: this.caches.lc79.stale || lc79Age > CONFIG.DATA.CACHE_TTL / 1000 * 2,
                retries: this.retryCounts.lc79 || 0
            }
        };
        
        this.eventEmitter.emit('health_check', status);
        return status;
    }
    
    getCache(source) {
        const cache = this.caches[source];
        if (!cache) return null;
        
        const now = new Date();
        const age = cache.lastUpdate ? (now - cache.lastUpdate) / 1000 : Infinity;
        
        return {
            data: cache.data,
            lastUpdate: cache.lastUpdate,
            age: age,
            stale: cache.stale || age > CONFIG.DATA.CACHE_TTL / 1000,
            retries: this.retryCounts[source] || 0
        };
    }
}

// ==================== API ROUTES ====================
const tradingSystem = new TaiXiuTradingSystem();

// Initialize system on startup
tradingSystem.initialize().then(success => {
    if (success) {
        console.log('✅ Trading system ready');
    } else {
        console.log('❌ Trading system failed to initialize');
    }
});

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'CUONGDEVGPT Tai Xiu Trading System v3.0',
        version: '3.0.0',
        creator: 'Big dad Cuongdepzaivcl',
        description: 'AI-powered Tai Xiu trading with risk management',
        endpoints: [
            '/status - System status',
            '/sunwin - Sunwin predictions',
            '/lc79 - LC79 predictions',
            '/backtest - Run backtest',
            '/performance - Trading performance',
            '/logs - View logs',
            '/bias - Bias analysis'
        ],
        message: 'System designed for "ĂN THẬT" with proper risk management 🚀'
    });
});

app.get('/status', async (req, res) => {
    try {
        const status = tradingSystem.getSystemStatus();
        const cacheStatus = tradingSystem.autoRefresh.healthCheck();
        
        res.json({
            success: true,
            system: status.system,
            data: status.data,
            performance: status.performance,
            cache: cacheStatus,
            decisions: status.decisions,
            bias: status.bias,
            stats: status.stats
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/sunwin', async (req, res) => {
    try {
        const cache = tradingSystem.autoRefresh.getCache('sunwin');
        
        if (!cache || cache.stale) {
            return res.json({
                success: false,
                error: 'Sunwin data not available or stale',
                cache: cache
            });
        }
        
        const latestSession = cache.data[0];
        if (!latestSession) {
            return res.json({
                success: false,
                error: 'No session data available'
            });
        }
        
        // Process the session
        const result = await tradingSystem.processNewSession(latestSession, 'sunwin');
        
        res.json({
            success: true,
            data: {
                session: latestSession,
                decision: result.decision,
                pTai: result.pTai,
                edge: result.edge,
                stake: result.finalStake,
                reason: result.reason,
                performance: result.performance,
                cache: {
                    age: cache.age,
                    stale: cache.stale
                }
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/lc79', async (req, res) => {
    try {
        const cache = tradingSystem.autoRefresh.getCache('lc79');
        
        if (!cache || cache.stale) {
            return res.json({
                success: false,
                error: 'LC79 data not available or stale',
                cache: cache
            });
        }
        
        const latestSession = cache.data[0];
        if (!latestSession) {
            return res.json({
                success: false,
                error: 'No session data available'
            });
        }
        
        // Process the session
        const result = await tradingSystem.processNewSession({
            id: latestSession.id,
            dices: latestSession.dices,
            point: latestSession.point,
            resultTruyenThong: latestSession.resultTruyenThong
        }, 'lc79');
        
        res.json({
            success: true,
            data: {
                session: latestSession,
                decision: result.decision,
                pTai: result.pTai,
                edge: result.edge,
                stake: result.finalStake,
                reason: result.reason,
                performance: result.performance,
                cache: {
                    age: cache.age,
                    stale: cache.stale
                }
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/backtest', async (req, res) => {
    try {
        const source = req.query.source || null;
        const sessions = tradingSystem.dataPipeline.getSessions(source, 2000, false);
        
        const result = await tradingSystem.runBacktest(source, sessions);
        
        res.json({
            success: result.success,
            data: result.success ? {
                metrics: result.metrics,
                baselines: result.baselines,
                interpretation: result.interpretation,
                sampleSize: sessions.length
            } : null,
            error: result.error
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/performance', async (req, res) => {
    try {
        const performance = tradingSystem.performanceTracker.getMetrics();
        const decisionStats = tradingSystem.riskEngine.getDecisionStats();
        
        res.json({
            success: true,
            data: {
                performance,
                decisionStats,
                shouldStop: tradingSystem.performanceTracker.shouldStopTrading()
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/logs', async (req, res) => {
    try {
        const type = req.query.type || null;
        const limit = parseInt(req.query.limit) || 100;
        
        const logs = await tradingSystem.logger.getRecentLogs(limit, type);
        
        res.json({
            success: true,
            data: {
                logs,
                count: logs.length
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/bias', async (req, res) => {
    try {
        const biasStatus = tradingSystem.dataPipeline.biasDetector.getStatus();
        
        res.json({
            success: true,
            data: biasStatus
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/simulate', async (req, res) => {
    try {
        const betOnTai = req.query.bet === 'tai';
        const pTai = parseFloat(req.query.p) || 0.5;
        const stake = parseFloat(req.query.stake) || 100;
        
        // Simulate a bet
        const random = Math.random();
        const actualTai = random < pTai;
        const won = betOnTai === actualTai;
        const pnl = won ? stake * 0.95 : -stake; // 5% house edge
        
        res.json({
            success: true,
            data: {
                betOn: betOnTai ? 'TAI' : 'XIU',
                pTai: pTai,
                stake: stake,
                actual: actualTai ? 'TAI' : 'XIU',
                won: won,
                pnl: pnl,
                random: random
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/reset', async (req, res) => {
    try {
        if (req.query.key !== process.env.RESET_KEY) {
            return res.status(403).json({
                success: false,
                error: 'Invalid reset key'
            });
        }
        
        // Reset performance tracker
        tradingSystem.performanceTracker = new PerformanceTracker();
        tradingSystem.riskEngine = new RiskEngine(tradingSystem.performanceTracker);
        
        res.json({
            success: true,
            message: 'System reset successfully'
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// ==================== START SERVER ====================
app.listen(port, () => {
    console.log(`=========================================`);
    console.log(`🚀 CUONGDEVGPT Tai Xiu Trading System v3.0`);
    console.log(`📍 Port: ${port}`);
    console.log(`👑 Creator: Big dad Cuongdepzaivcl`);
    console.log(`🎯 Mode: "ĂN THẬT" with Risk Management`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log(`=========================================`);
    console.log(`📊 Core Features:`);
    console.log(`   ✅ Data Pipeline with Validation`);
    console.log(`   ✅ Bias Detection & Statistical Tests`);
    console.log(`   ✅ Probability-Based Algorithms`);
    console.log(`   ✅ Ensemble Model with Calibration`);
    console.log(`   ✅ Walk-Forward Backtesting`);
    console.log(`   ✅ Risk Management Engine`);
    console.log(`   ✅ Performance Tracking & Logging`);
    console.log(`=========================================`);
    console.log(`📈 Endpoints:`);
    console.log(`   GET /          - System info`);
    console.log(`   GET /status    - Complete system status`);
    console.log(`   GET /sunwin    - Sunwin trading decision`);
    console.log(`   GET /lc79      - LC79 trading decision`);
    console.log(`   GET /backtest  - Run backtest analysis`);
    console.log(`   GET /performance - Trading performance`);
    console.log(`   GET /logs      - View trading logs`);
    console.log(`   GET /bias      - Bias analysis`);
    console.log(`   GET /simulate  - Simulate a bet`);
    console.log(`=========================================`);
    console.log(`⚠️  RISK WARNING:`);
    console.log(`   This is a trading system, not a guarantee of profit.`);
    console.log(`   Always practice proper risk management.`);
    console.log(`   The house always has an edge in gambling.`);
    console.log(`=========================================`);
});

// ==================== ERROR HANDLING ====================
process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', error);
    
    // Try to log the error
    tradingSystem.logger.logError(error, { type: 'uncaught_exception' })
        .catch(e => console.error('Failed to log error:', e));
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
    
    tradingSystem.logger.logError(new Error(`Unhandled rejection: ${reason}`), { promise })
        .catch(e => console.error('Failed to log rejection:', e));
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    
    tradingSystem.autoRefresh.stop();
    
    // Save data
    await tradingSystem.dataPipeline.saveToDisk();
    await tradingSystem.performanceTracker.saveToDisk();
    
    console.log('Shutdown complete');
    process.exit(0);
});

// ==================== EXPORTS FOR TESTING ====================
module.exports = {
    app,
    TaiXiuTradingSystem,
    ValidatedSession,
    AlgorithmResult,
    EnsembleModel,
    RiskEngine,
    BacktestEngine,
    tradingSystem
};

// #Wormgpt Cường Dev Don't Delete for copyright|