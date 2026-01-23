const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Cache lưu trữ dữ liệu và dự đoán
const cache = {
  sunwin: {
    data: null,
    lastUpdated: null,
    predictions: null
  },
  lc79: {
    data: null,
    lastUpdated: null,
    predictions: null
  }
};

// Hàm lấy dữ liệu từ API Sunwin
async function fetchSunwinData() {
  try {
    const response = await axios.get('http://180.93.52.196:3001/api/his');
    return response.data;
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu Sunwin:', error.message);
    return null;
  }
}

// Hàm lấy dữ liệu từ API LC79
async function fetchLC79Data() {
  try {
    const response = await axios.get('https://wtxmd52.tele68.com/v1/txmd5/sessions');
    return response.data;
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu LC79:', error.message);
    return null;
  }
}

// Hàm chuyển đổi dữ liệu LC79 về định dạng chuẩn
function normalizeLC79Data(lc79Data) {
  if (!lc79Data || !lc79Data.list) return [];
  
  return lc79Data.list.map(item => ({
    phien: item.id,
    xuc_xac_1: item.dices[0],
    xuc_xac_2: item.dices[1],
    xuc_xac_3: item.dices[2],
    tong: item.point,
    ket_qua: item.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu'
  })).reverse(); // Đảo ngược để phiên cũ lên đầu
}

// Hàm chuyển đổi dữ liệu Sunwin về định dạng chuẩn
function normalizeSunwinData(sunwinData) {
  if (!sunwinData || !Array.isArray(sunwinData)) return [];
  
  return sunwinData.map(item => ({
    phien: item.phien,
    xuc_xac_1: item.xuc_xac_1,
    xuc_xac_2: item.xuc_xac_2,
    xuc_xac_3: item.xuc_xac_3,
    tong: item.tong,
    ket_qua: item.ket_qua
  }));
}

// THUẬT TOÁN 1: Phân tích mẫu (Pattern Analysis)
function analyzePatterns(data) {
  if (!data || data.length < 5) return { prediction: 'Không đủ dữ liệu', confidence: 0 };
  
  const results = data.slice(-20).map(d => d.ket_qua);
  const recent = results.slice(-10);
  
  // Phân tích cầu bệt
  let streakLength = 1;
  for (let i = recent.length - 1; i > 0; i--) {
    if (recent[i] === recent[i - 1]) {
      streakLength++;
    } else {
      break;
    }
  }
  
  // Phân tích cầu 1-1
  let pattern11 = true;
  for (let i = recent.length - 1; i > 0; i--) {
    if (i % 2 === 0 && recent[i] !== recent[recent.length - 2]) {
      pattern11 = false;
      break;
    } else if (i % 2 === 1 && recent[i] !== recent[recent.length - 1]) {
      pattern11 = false;
      break;
    }
  }
  
  // Phân tích xu hướng
  const taiCount = recent.filter(r => r === 'Tài').length;
  const xiuCount = recent.filter(r => r === 'Xỉu').length;
  
  let prediction = '';
  let confidence = 0;
  
  // Quy tắc: Cầu bệt tiếp tục khi < 6
  if (streakLength < 6) {
    prediction = recent[recent.length - 1];
    confidence = 70 + (streakLength * 5);
  }
  // Quy tắc: Cầu bệt > 6 thì đảo chiều
  else if (streakLength >= 6) {
    prediction = recent[recent.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
    confidence = 75 + ((streakLength - 6) * 10);
  }
  // Quy tắc: Cầu 1-1
  else if (pattern11) {
    prediction = recent[recent.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
    confidence = 65;
  }
  // Quy tắc: Xu hướng nghiêng
  else {
    if (taiCount > xiuCount + 2) {
      prediction = 'Xỉu'; // Nghiêng Tài quá nhiều -> dự đoán Xỉu
      confidence = 60 + ((taiCount - xiuCount) * 5);
    } else if (xiuCount > taiCount + 2) {
      prediction = 'Tài'; // Nghiêng Xỉu quá nhiều -> dự đoán Tài
      confidence = 60 + ((xiuCount - taiCount) * 5);
    } else {
      prediction = recent[recent.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
      confidence = 55;
    }
  }
  
  return {
    prediction,
    confidence: Math.min(confidence, 95),
    pattern: streakLength >= 3 ? `Bệt ${streakLength}` : pattern11 ? '1-1' : 'Hỗn tạp',
    analysis: {
      streakLength,
      pattern11,
      taiCount,
      xiuCount,
      imbalance: Math.abs(taiCount - xiuCount)
    }
  };
}

// THUẬT TOÁN 2: Phân tích điểm xúc xắc
function analyzeDicePoints(data) {
  if (!data || data.length < 3) return { prediction: 'Không đủ dữ liệu', confidence: 0 };
  
  const recent = data.slice(-5);
  
  // Tính trung bình điểm
  const avgPoints = recent.reduce((sum, d) => sum + d.tong, 0) / recent.length;
  
  // Phân tích xu hướng điểm
  let trend = 'ổn định';
  if (recent.length >= 3) {
    const diff1 = recent[recent.length - 1].tong - recent[recent.length - 2].tong;
    const diff2 = recent[recent.length - 2].tong - recent[recent.length - 3].tong;
    if (diff1 > 0 && diff2 > 0) trend = 'tăng';
    else if (diff1 < 0 && diff2 < 0) trend = 'giảm';
  }
  
  // Phân tích số nhỏ/lớn
  const lastDice = recent[recent.length - 1];
  const hasSmallNumbers = lastDice.xuc_xac_1 <= 2 || lastDice.xuc_xac_2 <= 2 || lastDice.xuc_xac_3 <= 2;
  const hasLargeNumbers = lastDice.xuc_xac_1 >= 5 || lastDice.xuc_xac_2 >= 5 || lastDice.xuc_xac_3 >= 5;
  
  let prediction = '';
  let confidence = 0;
  let reasoning = [];
  
  // Quy tắc: Điểm quá thấp -> Tài
  if (lastDice.tong <= 6) {
    prediction = 'Tài';
    confidence = 75;
    reasoning.push(`Tổng ${lastDice.tong} quá thấp, xu hướng bật lên`);
  }
  // Quy tắc: Điểm quá cao -> Xỉu
  else if (lastDice.tong >= 15) {
    prediction = 'Xỉu';
    confidence = 75;
    reasoning.push(`Tổng ${lastDice.tong} quá cao, xu hướng hồi xuống`);
  }
  // Quy tắc: Nhiều số nhỏ -> Tài
  else if (hasSmallNumbers && !hasLargeNumbers) {
    prediction = 'Tài';
    confidence = 70;
    reasoning.push('Nhiều số nhỏ (1-2), xu hướng lên Tài');
  }
  // Quy tắc: Nhiều số lớn -> Xỉu
  else if (hasLargeNumbers && !hasSmallNumbers) {
    prediction = 'Xỉu';
    confidence = 70;
    reasoning.push('Nhiều số lớn (5-6), xu hướng xuống Xỉu');
  }
  // Quy tắc: Xu hướng điểm
  else if (trend === 'tăng' && avgPoints < 10.5) {
    prediction = 'Tài';
    confidence = 65;
    reasoning.push(`Xu hướng điểm tăng (${trend}), trung bình ${avgPoints.toFixed(1)}`);
  } else if (trend === 'giảm' && avgPoints > 10.5) {
    prediction = 'Xỉu';
    confidence = 65;
    reasoning.push(`Xu hướng điểm giảm (${trend}), trung bình ${avgPoints.toFixed(1)}`);
  }
  // Mặc định dựa trên ngưỡng 10.5
  else {
    prediction = avgPoints < 10.5 ? 'Tài' : 'Xỉu';
    confidence = 60;
    reasoning.push(`Trung bình điểm ${avgPoints.toFixed(1)} -> ${avgPoints < 10.5 ? 'Tài' : 'Xỉu'}`);
  }
  
  return {
    prediction,
    confidence,
    reasoning: reasoning.join(' | '),
    analysis: {
      avgPoints: avgPoints.toFixed(1),
      trend,
      lastTotal: lastDice.tong,
      hasSmallNumbers,
      hasLargeNumbers
    }
  };
}

// THUẬT TOÁN 3: Phân tích chu kỳ (Cycle Analysis)
function analyzeCycles(data) {
  if (!data || data.length < 20) return { prediction: 'Không đủ dữ liệu', confidence: 0 };
  
  const results = data.slice(-50).map(d => d.ket_qua);
  
  // Tìm các chu kỳ lặp lại
  const cycles = [];
  for (let cycleLength = 2; cycleLength <= 8; cycleLength++) {
    if (results.length >= cycleLength * 3) {
      const lastCycle = results.slice(-cycleLength);
      let matchCount = 0;
      
      for (let i = results.length - cycleLength * 2; i >= cycleLength; i -= cycleLength) {
        const compareCycle = results.slice(i, i + cycleLength);
        if (JSON.stringify(compareCycle) === JSON.stringify(lastCycle)) {
          matchCount++;
        }
      }
      
      if (matchCount >= 1) {
        cycles.push({
          length: cycleLength,
          pattern: lastCycle,
          matches: matchCount,
          confidence: Math.min(70 + (matchCount * 10), 90)
        });
      }
    }
  }
  
  // Nếu tìm thấy chu kỳ
  if (cycles.length > 0) {
    // Chọn chu kỳ có độ tin cậy cao nhất
    const bestCycle = cycles.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
    
    // Dự đoán dựa trên chu kỳ
    const nextIndex = bestCycle.pattern.length % bestCycle.pattern.length;
    const prediction = bestCycle.pattern[nextIndex];
    
    return {
      prediction,
      confidence: bestCycle.confidence,
      cycleLength: bestCycle.length,
      pattern: bestCycle.pattern.join('-'),
      cycleMatches: bestCycle.matches,
      analysis: { cyclesFound: cycles.length }
    };
  }
  
  // Phân tích cầu nghiêng 5
  const recent5 = results.slice(-5);
  const taiCount5 = recent5.filter(r => r === 'Tài').length;
  const xiuCount5 = recent5.filter(r => r === 'Xỉu').length;
  
  if (Math.abs(taiCount5 - xiuCount5) >= 3) {
    const prediction = taiCount5 > xiuCount5 ? 'Xỉu' : 'Tài';
    const confidence = 70 + (Math.abs(taiCount5 - xiuCount5) * 5);
    
    return {
      prediction,
      confidence: Math.min(confidence, 85),
      pattern: `Nghiêng ${Math.abs(taiCount5 - xiuCount5)} (${taiCount5}T-${xiuCount5}X)`,
      analysis: { taiCount5, xiuCount5, imbalance: Math.abs(taiCount5 - xiuCount5) }
    };
  }
  
  // Mặc định
  return {
    prediction: results[results.length - 1] === 'Tài' ? 'Xỉu' : 'Tài',
    confidence: 55,
    pattern: 'Đảo chiều mặc định',
    analysis: { cyclesFound: 0 }
  };
}

// THUẬT TOÁN 4: Phân tích thống kê nâng cao
function analyzeStatistics(data) {
  if (!data || data.length < 30) return { prediction: 'Không đủ dữ liệu', confidence: 0 };
  
  const allResults = data.map(d => d.ket_qua);
  const recentResults = data.slice(-20).map(d => d.ket_qua);
  const recentPoints = data.slice(-10).map(d => d.tong);
  
  // Tính tỷ lệ Tài/Xỉu
  const totalTai = allResults.filter(r => r === 'Tài').length;
  const totalXiu = allResults.filter(r => r === 'Xỉu').length;
  const totalRatio = totalTai / allResults.length;
  
  const recentTai = recentResults.filter(r => r === 'Tài').length;
  const recentXiu = recentResults.filter(r => r === 'Xỉu').length;
  const recentRatio = recentTai / recentResults.length;
  
  // Phân tích điểm
  const avgPoint = recentPoints.reduce((a, b) => a + b, 0) / recentPoints.length;
  const pointStdDev = Math.sqrt(
    recentPoints.map(p => Math.pow(p - avgPoint, 2)).reduce((a, b) => a + b, 0) / recentPoints.length
  );
  
  // Phân tích cầu bệt hiện tại
  let currentStreak = 1;
  const lastResult = recentResults[recentResults.length - 1];
  for (let i = recentResults.length - 2; i >= 0; i--) {
    if (recentResults[i] === lastResult) {
      currentStreak++;
    } else {
      break;
    }
  }
  
  // Tính điểm dự đoán dựa trên nhiều yếu tố
  let taiScore = 0;
  let xiuScore = 0;
  
  // Yếu tố 1: Cân bằng tổng thể
  if (totalRatio > 0.55) taiScore += 15;
  else if (totalRatio < 0.45) xiuScore += 15;
  
  // Yếu tố 2: Xu hướng gần đây
  if (recentRatio > 0.6) taiScore += 20;
  else if (recentRatio < 0.4) xiuScore += 20;
  
  // Yếu tố 3: Điểm trung bình
  if (avgPoint < 10.2) taiScore += 25;
  else if (avgPoint > 10.8) xiuScore += 25;
  
  // Yếu tố 4: Cầu bệt
  if (currentStreak >= 4) {
    if (lastResult === 'Tài') xiuScore += 30;
    else taiScore += 30;
  }
  
  // Yếu tố 5: Độ lệch chuẩn (biến động)
  if (pointStdDev > 4) {
    // Biến động cao -> dự đoán đảo chiều
    if (lastResult === 'Tài') xiuScore += 10;
    else taiScore += 10;
  }
  
  const prediction = taiScore > xiuScore ? 'Tài' : 'Xỉu';
  const totalScore = taiScore + xiuScore;
  const confidence = totalScore > 0 ? Math.round((Math.max(taiScore, xiuScore) / totalScore) * 100) : 50;
  
  return {
    prediction,
    confidence,
    taiScore,
    xiuScore,
    scoreDifference: Math.abs(taiScore - xiuScore),
    analysis: {
      totalGames: allResults.length,
      totalTai,
      totalXiu,
      totalRatio: totalRatio.toFixed(3),
      recentTai,
      recentXiu,
      recentRatio: recentRatio.toFixed(3),
      avgPoint: avgPoint.toFixed(2),
      pointStdDev: pointStdDev.toFixed(2),
      currentStreak
    }
  };
}

// THUẬT TOÁN 5: Phân tích theo thời gian (Time-based)
function analyzeTimePattern(data) {
  if (!data || data.length < 10) return { prediction: 'Không đủ dữ liệu', confidence: 0 };
  
  const recent = data.slice(-10);
  const now = new Date();
  const hour = now.getHours();
  
  let prediction = '';
  let confidence = 0;
  let timePattern = '';
  
  // Phân tích theo khung giờ
  if (hour >= 19 && hour <= 23) {
    // Giờ cao điểm: cầu loạn, ưu tiên 1-1
    const lastResults = recent.slice(-4).map(d => d.ket_qua);
    const isAlternating = lastResults.length >= 3 &&
      lastResults[0] !== lastResults[1] &&
      lastResults[1] !== lastResults[2];
    
    if (isAlternating) {
      prediction = lastResults[lastResults.length - 1] === 'Tài' ? 'Xỉu' : 'Tài';
      confidence = 65;
      timePattern = 'Giờ cao điểm (19-23h): Cầu 1-1';
    } else {
      // Phân tích ngắn hạn
      const last3 = recent.slice(-3).map(d => d.ket_qua);
      const last3Tai = last3.filter(r => r === 'Tài').length;
      prediction = last3Tai >= 2 ? 'Xỉu' : 'Tài';
      confidence = 60;
      timePattern = 'Giờ cao điểm: Phân tích ngắn';
    }
  } else if (hour >= 0 && hour <= 6) {
    // Đêm khuya: dễ có cầu bệt dài
    const streaks = [];
    let currentStreak = 1;
    let currentType = recent[0].ket_qua;
    
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].ket_qua === currentType) {
        currentStreak++;
      } else {
        streaks.push({ type: currentType, length: currentStreak });
        currentType = recent[i].ket_qua;
        currentStreak = 1;
      }
    }
    streaks.push({ type: currentType, length: currentStreak });
    
    const lastStreak = streaks[streaks.length - 1];
    
    if (lastStreak.length <= 4) {
      prediction = lastStreak.type;
      confidence = 75;
      timePattern = `Đêm khuya (0-6h): Bệt tiếp (${lastStreak.length})`;
    } else {
      prediction = lastStreak.type === 'Tài' ? 'Xỉu' : 'Tài';
      confidence = 70;
      timePattern = `Đêm khuya: Bẻ cầu sau ${lastStreak.length} ván`;
    }
  } else {
    // Giờ bình thường: kết hợp nhiều yếu tố
    const last5 = recent.slice(-5);
    const taiCount = last5.filter(d => d.ket_qua === 'Tài').length;
    const xiuCount = last5.filter(d => d.ket_qua === 'Xỉu').length;
    
    if (Math.abs(taiCount - xiuCount) >= 3) {
      prediction = taiCount > xiuCount ? 'Xỉu' : 'Tài';
      confidence = 70;
      timePattern = `Giờ thường: Nghiêng ${Math.abs(taiCount - xiuCount)}`;
    } else {
      // Sử dụng điểm xúc xắc
      const lastDice = last5[last5.length - 1];
      const sum = lastDice.xuc_xac_1 + lastDice.xuc_xac_2 + lastDice.xuc_xac_3;
      
      if (sum <= 9) {
        prediction = 'Tài';
        confidence = 65;
        timePattern = `Giờ thường: Tổng thấp (${sum}) -> Tài`;
      } else if (sum >= 12) {
        prediction = 'Xỉu';
        confidence = 65;
        timePattern = `Giờ thường: Tổng cao (${sum}) -> Xỉu`;
      } else {
        prediction = lastDice.ket_qua === 'Tài' ? 'Xỉu' : 'Tài';
        confidence = 55;
        timePattern = 'Giờ thường: Đảo chiều mặc định';
      }
    }
  }
  
  return {
    prediction,
    confidence,
    timePattern,
    analysis: {
      currentHour: hour,
      recentGames: recent.length
    }
  };
}

// THUẬT TOÁN 6: Phân tích kết hợp xúc xắc
function analyzeDiceCombination(data) {
  if (!data || data.length < 5) return { prediction: 'Không đủ dữ liệu', confidence: 0 };
  
  const recent = data.slice(-5);
  const lastSession = recent[recent.length - 1];
  
  const dice1 = lastSession.xuc_xac_1;
  const dice2 = lastSession.xuc_xac_2;
  const dice3 = lastSession.xuc_xac_3;
  const total = lastSession.tong;
  
  let prediction = '';
  let confidence = 0;
  let reasoning = [];
  
  // Quy tắc: Có kép (2 số giống nhau)
  const diceCounts = [dice1, dice2, dice3].reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
  
  const hasPair = Object.values(diceCounts).some(count => count >= 2);
  const hasTriple = Object.values(diceCounts).some(count => count === 3);
  
  if (hasTriple) {
    // Bão (3 số giống nhau) -> dễ đảo chiều
    prediction = lastSession.ket_qua === 'Tài' ? 'Xỉu' : 'Tài';
    confidence = 80;
    reasoning.push(`Bão ${dice1}-${dice2}-${dice3} -> đảo chiều`);
  }
  else if (hasPair) {
    // Có kép -> phân tích thêm
    const pairValue = Object.keys(diceCounts).find(key => diceCounts[key] >= 2);
    
    if (pairValue <= 3) {
      // Kép số nhỏ -> Tài
      prediction = 'Tài';
      confidence = 75;
      reasoning.push(`Kép số nhỏ (${pairValue}) -> Tài`);
    } else if (pairValue >= 4) {
      // Kép số lớn -> Xỉu
      prediction = 'Xỉu';
      confidence = 75;
      reasoning.push(`Kép số lớn (${pairValue}) -> Xỉu`);
    } else {
      prediction = total < 10.5 ? 'Tài' : 'Xỉu';
      confidence = 65;
      reasoning.push(`Kép trung bình, dựa tổng ${total}`);
    }
  }
  // Quy tắc: Số chênh lệch lớn
  else if (Math.max(dice1, dice2, dice3) - Math.min(dice1, dice2, dice3) >= 4) {
    prediction = 'Tài'; // Chênh lệch lớn thường về Tài
    confidence = 70;
    reasoning.push(`Chênh lệch lớn (${Math.max(dice1, dice2, dice3)}-${Math.min(dice1, dice2, dice3)}=${Math.max(dice1, dice2, dice3) - Math.min(dice1, dice2, dice3)}) -> Tài`);
  }
  // Quy tắc: Dãy số liên tiếp
  else if (Math.abs(dice1 - dice2) === 1 && Math.abs(dice2 - dice3) === 1) {
    const sorted = [dice1, dice2, dice3].sort((a, b) => a - b);
    if (sorted[0] <= 2) {
      prediction = 'Tài';
      confidence = 70;
      reasoning.push(`Dãy số nhỏ (${sorted.join('-')}) -> Tài`);
    } else if (sorted[2] >= 5) {
      prediction = 'Xỉu';
      confidence = 70;
      reasoning.push(`Dãy số lớn (${sorted.join('-')}) -> Xỉu`);
    } else {
      prediction = lastSession.ket_qua === 'Tài' ? 'Xỉu' : 'Tài';
      confidence = 60;
      reasoning.push(`Dãy số trung bình -> đảo chiều`);
    }
  }
  // Quy tắc dựa trên vị trí số
  else {
    const smallCount = [dice1, dice2, dice3].filter(d => d <= 2).length;
    const largeCount = [dice1, dice2, dice3].filter(d => d >= 5).length;
    
    if (smallCount >= 2) {
      prediction = 'Tài';
      confidence = 75;
      reasoning.push(`${smallCount} số nhỏ (1-2) -> Tài`);
    } else if (largeCount >= 2) {
      prediction = 'Xỉu';
      confidence = 75;
      reasoning.push(`${largeCount} số lớn (5-6) -> Xỉu`);
    } else {
      // Phân tích xu hướng 3 phiên gần nhất
      if (recent.length >= 3) {
        const last3 = recent.slice(-3);
        const last3Tai = last3.filter(d => d.ket_qua === 'Tài').length;
        
        if (last3Tai >= 2) {
          prediction = 'Xỉu';
          confidence = 65;
          reasoning.push('2/3 phiên gần nhất Tài -> Xỉu');
        } else if (last3Tai <= 1) {
          prediction = 'Tài';
          confidence = 65;
          reasoning.push('2/3 phiên gần nhất Xỉu -> Tài');
        } else {
          prediction = total < 10.5 ? 'Tài' : 'Xỉu';
          confidence = 60;
          reasoning.push(`Dựa tổng ${total}`);
        }
      } else {
        prediction = total < 10.5 ? 'Tài' : 'Xỉu';
        confidence = 60;
        reasoning.push(`Dựa tổng ${total}`);
      }
    }
  }
  
  return {
    prediction,
    confidence,
    reasoning: reasoning.join(' | '),
    analysis: {
      dice1,
      dice2,
      dice3,
      total,
      hasPair,
      hasTriple,
      diceCounts,
      smallCount: [dice1, dice2, dice3].filter(d => d <= 2).length,
      largeCount: [dice1, dice2, dice3].filter(d => d >= 5).length
    }
  };
}

// THUẬT TOÁN 7: Machine Learning đơn giản (Weighted Voting)
function analyzeMLWeighted(data) {
  if (!data || data.length < 15) return { prediction: 'Không đủ dữ liệu', confidence: 0 };
  
  // Thu thập features
  const recent = data.slice(-15);
  const features = {
    // Xu hướng ngắn hạn (5 phiên)
    shortTrend: () => {
      const last5 = recent.slice(-5);
      const taiCount = last5.filter(d => d.ket_qua === 'Tài').length;
      return taiCount >= 3 ? 1 : taiCount <= 2 ? -1 : 0;
    },
    
    // Xu hướng dài hạn (15 phiên)
    longTrend: () => {
      const taiCount = recent.filter(d => d.ket_qua === 'Tài').length;
      return taiCount >= 8 ? 1 : taiCount <= 7 ? -1 : 0;
    },
    
    // Điểm trung bình
    avgPoint: () => {
      const points = recent.slice(-10).map(d => d.tong);
      const avg = points.reduce((a, b) => a + b, 0) / points.length;
      return avg < 10.3 ? 1 : avg > 10.7 ? -1 : 0;
    },
    
    // Cầu bệt hiện tại
    currentStreak: () => {
      let streak = 1;
      const lastResult = recent[recent.length - 1].ket_qua;
      for (let i = recent.length - 2; i >= 0; i--) {
        if (recent[i].ket_qua === lastResult) streak++;
        else break;
      }
      return streak >= 4 ? (lastResult === 'Tài' ? -1 : 1) : 0;
    },
    
    // Biến động điểm
    volatility: () => {
      const points = recent.slice(-8).map(d => d.tong);
      const avg = points.reduce((a, b) => a + b, 0) / points.length;
      const variance = points.map(p => Math.pow(p - avg, 2)).reduce((a, b) => a + b, 0) / points.length;
      return variance > 15 ? 1 : variance < 8 ? -1 : 0;
    },
    
    // Pattern đặc biệt
    specialPattern: () => {
      const lastResults = recent.slice(-6).map(d => d.ket_qua);
      
      // Kiểm tra pattern T-T-X-T-T-X
      if (lastResults.length >= 6) {
        const pattern = lastResults.slice(-6);
        if (pattern[0] === 'Tài' && pattern[1] === 'Tài' && pattern[2] === 'Xỉu' &&
            pattern[3] === 'Tài' && pattern[4] === 'Tài' && pattern[5] === 'Xỉu') {
          return -1; // Dự đoán Tài
        }
      }
      
      // Kiểm tra pattern X-X-T-X-X-T
      if (lastResults.length >= 6) {
        const pattern = lastResults.slice(-6);
        if (pattern[0] === 'Xỉu' && pattern[1] === 'Xỉu' && pattern[2] === 'Tài' &&
            pattern[3] === 'Xỉu' && pattern[4] === 'Xỉu' && pattern[5] === 'Tài') {
          return 1; // Dự đoán Xỉu
        }
      }
      
      return 0;
    }
  };
  
  // Tính weighted score
  const weights = {
    shortTrend: 1.5,
    longTrend: 1.0,
    avgPoint: 1.8,
    currentStreak: 2.0,
    volatility: 1.2,
    specialPattern: 2.5
  };
  
  let taiScore = 0;
  let xiuScore = 0;
  
  for (const [feature, weight] of Object.entries(weights)) {
    const value = features[feature]();
    if (value > 0) taiScore += weight;
    else if (value < 0) xiuScore += weight;
  }
  
  // Thêm yếu tố điều chỉnh theo thời gian thực
  const lastSession = recent[recent.length - 1];
  const hour = new Date().getHours();
  
  if (hour >= 22 || hour <= 4) {
    // Đêm khuya: tăng trọng số cho cầu bệt
    taiScore *= 1.1;
    xiuScore *= 1.1;
  }
  
  const prediction = taiScore > xiuScore ? 'Tài' : 'Xỉu';
  const totalScore = taiScore + xiuScore;
  const confidence = totalScore > 0 ? Math.round((Math.max(taiScore, xiuScore) / totalScore) * 100) : 50;
  
  return {
    prediction,
    confidence,
    taiScore: taiScore.toFixed(2),
    xiuScore: xiuScore.toFixed(2),
    scoreDifference: Math.abs(taiScore - xiuScore).toFixed(2),
    analysis: {
      featureScores: Object.keys(features).reduce((acc, key) => {
        acc[key] = features[key]();
        return acc;
      }, {}),
      weights,
      totalScore: totalScore.toFixed(2)
    }
  };
}

// Hàm tổng hợp tất cả thuật toán
function runAllAlgorithms(data) {
  const algorithms = [
    { name: 'Pattern Analysis', func: analyzePatterns },
    { name: 'Dice Points Analysis', func: analyzeDicePoints },
    { name: 'Cycle Analysis', func: analyzeCycles },
    { name: 'Statistical Analysis', func: analyzeStatistics },
    { name: 'Time Pattern Analysis', func: analyzeTimePattern },
    { name: 'Dice Combination Analysis', func: analyzeDiceCombination },
    { name: 'ML Weighted Voting', func: analyzeMLWeighted }
  ];
  
  const results = {};
  const predictions = { Tài: 0, Xỉu: 0 };
  let totalConfidence = 0;
  let algorithmCount = 0;
  
  // Chạy tất cả thuật toán
  algorithms.forEach(algo => {
    try {
      const result = algo.func(data);
      if (result.prediction && result.prediction !== 'Không đủ dữ liệu') {
        results[algo.name] = result;
        predictions[result.prediction]++;
        totalConfidence += result.confidence;
        algorithmCount++;
      }
    } catch (error) {
      console.error(`Lỗi thuật toán ${algo.name}:`, error.message);
    }
  });
  
  // Tính dự đoán cuối cùng
  let finalPrediction = '';
  let finalConfidence = 0;
  let agreementRatio = 0;
  
  if (algorithmCount > 0) {
    finalPrediction = predictions.Tài > predictions.Xỉu ? 'Tài' : 'Xỉu';
    agreementRatio = Math.round((Math.max(predictions.Tài, predictions.Xỉu) / algorithmCount) * 100);
    finalConfidence = Math.round(totalConfidence / algorithmCount);
    
    // Điều chỉnh confidence dựa trên agreement
    finalConfidence = Math.min(95, finalConfidence + (agreementRatio - 50) / 2);
  } else {
    finalPrediction = 'Không thể dự đoán';
    finalConfidence = 0;
    agreementRatio = 0;
  }
  
  // Xác định độ mạnh của tín hiệu
  let signalStrength = 'YẾU';
  if (finalConfidence >= 75) signalStrength = 'MẠNH';
  else if (finalConfidence >= 60) signalStrength = 'TRUNG BÌNH';
  
  // Tạo phương pháp mô tả
  const methods = [];
  Object.keys(results).forEach(algoName => {
    if (results[algoName].prediction === finalPrediction) {
      methods.push(`${algoName}: ${results[algoName].confidence}%`);
    }
  });
  
  const methodDescription = methods.length > 0 
    ? `${methods.slice(0, 3).join(' | ')}`
    : 'Kết hợp đa thuật toán';
  
  return {
    finalPrediction,
    finalConfidence,
    agreementRatio,
    signalStrength,
    algorithmResults: results,
    predictionCounts: predictions,
    algorithmCount,
    methodDescription
  };
}

// Hàm cập nhật dữ liệu và tính toán dự đoán
async function updateDataAndPredictions() {
  console.log('Đang cập nhật dữ liệu và tính toán dự đoán...');
  
  try {
    // Cập nhật Sunwin
    const sunwinData = await fetchSunwinData();
    if (sunwinData) {
      const normalizedSunwin = normalizeSunwinData(sunwinData);
      cache.sunwin.data = normalizedSunwin;
      cache.sunwin.lastUpdated = new Date();
      cache.sunwin.predictions = runAllAlgorithms(normalizedSunwin);
      console.log('Đã cập nhật Sunwin data');
    }
    
    // Cập nhật LC79
    const lc79Data = await fetchLC79Data();
    if (lc79Data) {
      const normalizedLC79 = normalizeLC79Data(lc79Data);
      cache.lc79.data = normalizedLC79;
      cache.lc79.lastUpdated = new Date();
      cache.lc79.predictions = runAllAlgorithms(normalizedLC79);
      console.log('Đã cập nhật LC79 data');
    }
    
    return true;
  } catch (error) {
    console.error('Lỗi khi cập nhật dữ liệu:', error.message);
    return false;
  }
}

// Endpoint: /sunwin
app.get('/sunwin', async (req, res) => {
  try {
    // Kiểm tra cache hoặc cập nhật
    if (!cache.sunwin.lastUpdated || Date.now() - cache.sunwin.lastUpdated > 60000) {
      await updateDataAndPredictions();
    }
    
    if (!cache.sunwin.data || !cache.sunwin.predictions) {
      return res.status(503).json({ 
        success: false, 
        message: 'Đang khởi tạo dữ liệu, vui lòng thử lại sau 30 giây' 
      });
    }
    
    const data = cache.sunwin.data;
    const predictions = cache.sunwin.predictions;
    
    // Lấy phiên gần nhất
    const latestSession = data[data.length - 1];
    const currentSession = latestSession ? latestSession.phien + 1 : 0;
    const nextSession = currentSession + 1;
    
    // Chuẩn bị response
    const response = {
      success: true,
      data: {
        previous_session: latestSession ? {
          phien: latestSession.phien,
          xuc_xac_1: latestSession.xuc_xac_1,
          xuc_xac_2: latestSession.xuc_xac_2,
          xuc_xac_3: latestSession.xuc_xac_3,
          tong: latestSession.tong,
          ket_qua: latestSession.ket_qua
        } : null,
        current_session: currentSession,
        next_session: nextSession,
        du_doan: predictions.finalPrediction,
        do_tin_cay: `${predictions.finalConfidence}%`,
        do_manh: predictions.signalStrength,
        phuong_phap: predictions.methodDescription,
        thong_tin_bo_sung: {
          thuat_toan_su_dung: predictions.algorithmCount,
          patterns_da_tai: data.length,
          diem_so: {
            totalAlgorithms: predictions.algorithmCount,
            agreeingAlgorithms: Math.max(predictions.predictionCounts.Tài, predictions.predictionCounts.Xỉu),
            taiScore: predictions.predictionCounts.Tài,
            xiuScore: predictions.predictionCounts.Xỉu,
            scoreDifference: Math.abs(predictions.predictionCounts.Tài - predictions.predictionCounts.Xỉu),
            agreementRatio: `${predictions.agreementRatio}%`
          },
          xuc_xac_cuoi: latestSession ? [
            latestSession.xuc_xac_1,
            latestSession.xuc_xac_2,
            latestSession.xuc_xac_3
          ] : []
        }
      },
      timestamp: new Date().toISOString(),
      cache_age: cache.sunwin.lastUpdated ? 
        Math.round((Date.now() - cache.sunwin.lastUpdated) / 1000) : 0
    };
    
    res.json(response);
  } catch (error) {
    console.error('Lỗi endpoint /sunwin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// Endpoint: /lc79
app.get('/lc79', async (req, res) => {
  try {
    // Kiểm tra cache hoặc cập nhật
    if (!cache.lc79.lastUpdated || Date.now() - cache.lc79.lastUpdated > 60000) {
      await updateDataAndPredictions();
    }
    
    if (!cache.lc79.data || !cache.lc79.predictions) {
      return res.status(503).json({ 
        success: false, 
        message: 'Đang khởi tạo dữ liệu, vui lòng thử lại sau 30 giây' 
      });
    }
    
    const data = cache.lc79.data;
    const predictions = cache.lc79.predictions;
    
    // Lấy phiên gần nhất
    const latestSession = data[data.length - 1];
    const currentSession = latestSession ? latestSession.phien + 1 : 0;
    const nextSession = currentSession + 1;
    
    // Chuẩn bị response
    const response = {
      success: true,
      data: {
        previous_session: latestSession ? {
          phien: latestSession.phien,
          xuc_xac_1: latestSession.xuc_xac_1,
          xuc_xac_2: latestSession.xuc_xac_2,
          xuc_xac_3: latestSession.xuc_xac_3,
          tong: latestSession.tong,
          ket_qua: latestSession.ket_qua
        } : null,
        current_session: currentSession,
        next_session: nextSession,
        du_doan: predictions.finalPrediction,
        do_tin_cay: `${predictions.finalConfidence}%`,
        do_manh: predictions.signalStrength,
        phuong_phap: predictions.methodDescription,
        thong_tin_bo_sung: {
          thuat_toan_su_dung: predictions.algorithmCount,
          patterns_da_tai: data.length,
          diem_so: {
            totalAlgorithms: predictions.algorithmCount,
            agreeingAlgorithms: Math.max(predictions.predictionCounts.Tài, predictions.predictionCounts.Xỉu),
            taiScore: predictions.predictionCounts.Tài,
            xiuScore: predictions.predictionCounts.Xỉu,
            scoreDifference: Math.abs(predictions.predictionCounts.Tài - predictions.predictionCounts.Xỉu),
            agreementRatio: `${predictions.agreementRatio}%`
          },
          xuc_xac_cuoi: latestSession ? [
            latestSession.xuc_xac_1,
            latestSession.xuc_xac_2,
            latestSession.xuc_xac_3
          ] : []
        }
      },
      timestamp: new Date().toISOString(),
      cache_age: cache.lc79.lastUpdated ? 
        Math.round((Date.now() - cache.lc79.lastUpdated) / 1000) : 0
    };
    
    res.json(response);
  } catch (error) {
    console.error('Lỗi endpoint /lc79:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// Endpoint health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    sunwin: {
      hasData: !!cache.sunwin.data,
      lastUpdated: cache.sunwin.lastUpdated,
      dataCount: cache.sunwin.data ? cache.sunwin.data.length : 0
    },
    lc79: {
      hasData: !!cache.lc79.data,
      lastUpdated: cache.lc79.lastUpdated,
      dataCount: cache.lc79.data ? cache.lc79.data.length : 0
    },
    uptime: process.uptime()
  });
});

// Khởi động server và cập nhật dữ liệu ban đầu
async function startServer() {
  // Cập nhật dữ liệu ban đầu
  await updateDataAndPredictions();
  
  // Tự động cập nhật mỗi 30 giây
  setInterval(updateDataAndPredictions, 15000);
  
  app.listen(PORT, () => {
    console.log(`Server đang chạy trên port ${PORT}`);
    console.log('Endpoints:');
    console.log(`  GET /sunwin    - Dự đoán Sunwin`);
    console.log(`  GET /lc79      - Dự đoán LC79`);
    console.log(`  GET /health    - Kiểm tra tình trạng server`);
  });
}

startServer().catch(console.error);