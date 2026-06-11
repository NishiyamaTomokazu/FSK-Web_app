class FSKDemodulator {
    constructor() {
        this.SAMPLE_RATE = 8000;
        this.FREQ_ONE = 1200;
        this.FREQ_ZERO = 2200;
        this.BAUD_RATE = 300;
        this.samplesPerBit = this.SAMPLE_RATE / this.BAUD_RATE;
        
        this.audioContext = null;
        this.processor = null;
        this.buffer = [];
    }

    // ゴーツェルアルゴリズム（特定周波数の強度を検出）
    goertzel(samples, targetFreq, sampleRate) {
        const N = samples.length;
        const k = Math.round(N * targetFreq / sampleRate);
        const omega = (2 * Math.PI * k) / N;
        const coeff = 2 * Math.cos(omega);
        
        let s0 = 0, s1 = 0, s2 = 0;
        for (let n = 0; n < N; n++) {
            s0 = samples[n] + coeff * s1 - s2;
            s2 = s1;
            s1 = s0;
        }
        // パワー（強度）を返す
        return s1 * s1 + s2 * s2 - coeff * s1 * s2;
    }

    // 1ビット分のサンプルを復調
    demodulateBlock(samples) {
        const powerOne  = this.goertzel(samples, this.FREQ_ONE,  this.SAMPLE_RATE);
        const powerZero = this.goertzel(samples, this.FREQ_ZERO, this.SAMPLE_RATE);
        return powerOne > powerZero ? 1 : 0;
    }

    // バイト列の復元（スタート/ストップビット処理）
    decodeBytes(bits) {
        const bytes = [];
        let i = 0;
        while (i < bits.length) {
            // スタートビット(0)を探す
            if (bits[i] !== 0) { i++; continue; }
            i++; // スタートビットをスキップ
            if (i + 8 > bits.length) break;
            
            let byte = 0;
            for (let b = 0; b < 8; b++) {
                byte |= (bits[i + b] << b);
            }
            i += 8;
            
            // ストップビット確認
            if (bits[i] === 1) {
                bytes.push(byte);
            }
            i++;
        }
        return bytes;
    }

    // マイク入力の開始
    async start(onDataReceived) {
        this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = this.audioContext.createMediaStreamSource(stream);
        
        // ScriptProcessorNode（または AudioWorklet）でサンプル取得
        this.processor = this.audioContext.createScriptProcessor(
            this.samplesPerBit, 1, 1
        );
        
        const bits = [];
        this.processor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const bit = this.demodulateBlock(input);
            bits.push(bit);
            
            // 一定量ビットが溜まったらデコード
            if (bits.length >= 100) {
                const bytes = this.decodeBytes([...bits]);
                if (bytes.length > 0) {
                    onDataReceived(bytes);
                    bits.splice(0, bits.length - 20); // 処理済みを削除
                }
            }
        };
        
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
    }
}

// 使用例
const demod = new FSKDemodulator();
demod.start((bytes) => {
    const text = String.fromCharCode(...bytes);
    console.log("受信データ:", text);
    document.getElementById("output").textContent += text;
});