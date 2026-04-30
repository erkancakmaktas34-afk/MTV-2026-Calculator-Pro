// 🚨 WEB WORKER MİMARİSİ - ARKA PLAN HESAPLAMA ÜNİTESİ
// Ana Thread'i (UI) kilitlememek için ağır verileri burada işliyoruz.

importScripts('mtv_data_2026.js');

self.onmessage = function (e) {
    const { type, payload } = e.data;

    // Legacy support for direct messages
    if (!type && e.data.vehicleType) {
        const result = calculateTaxInWorker(e.data);
        self.postMessage(result);
        return;
    }

    if (type === 'calculate') {
        const result = calculateTaxInWorker(payload);
        self.postMessage({ type: 'calculationResult', payload: result });
    }
    else if (type === 'getMatrahTiers') {
        let tiers = [];
        if (payload.vehicleType.startsWith('elektrikli_')) {
            tiers = getEVMatrahTiers(payload.motorPower || '86_105', payload.year);
        } else {
            tiers = getMatrahTiersForCC(payload.engineSize || '1301_1600', payload.year);
        }
        self.postMessage({ type: 'matrahTiers', payload: tiers });
    }
};

function calculateTaxInWorker(formData) {
    let tax = 0;
    const type = formData.vehicleType;
    const isElectric = type.startsWith('elektrikli_');
    const baseType = isElectric ? type.replace('elektrikli_', '') : type;
    const age = formData.vehicleAge;

    if (baseType === 'otomobil') {
        let engineKey = isElectric ? mapPowerToEngine(formData.motorPower) : formData.engineSize;
        if (formData.registrationDate === 'after2018') {
            if (isElectric && typeof getEVRate_2026 === 'function') {
                tax = getEVRate_2026(formData.motorPower, age, formData.matrahTier) || 0;
            } else {
                tax = calculateMTV_2026_New(engineKey, formData.matrahTier, age);
            }
        } else {
            if (isElectric) {
                tax = 0;
            } else {
                tax = calculatePRE2018(engineKey, age);
            }
        }
    }
    else if (baseType === 'motosiklet') {
        const key = isElectric ? mapMotoPowerToEngine(formData.motoEngine) : formData.motoEngine || '100_250';
        if (isElectric && typeof EV_MOTO_TAX_TABLE_2026 !== 'undefined') {
            const motoKey = formData.motoEngine || '7_15';
            if (EV_MOTO_TAX_TABLE_2026[motoKey]) tax = EV_MOTO_TAX_TABLE_2026[motoKey][age];
        } else {
            if (motosikletler_2026[key]) tax = motosikletler_2026[key][age];
            if (isElectric) tax = Math.floor(tax / 4);
        }
    }
    else if (baseType === 'kamyonet' || type.includes('kamyonet')) {
        const key = 'kamyonet_' + (formData.vehicleWeight || '1500');
        if (tarife_II_2026[key]) tax = tarife_II_2026[key][age];
        if (isElectric) tax = Math.floor(tax / 4);
    }
    else if (baseType === 'panelvan') {
        let panelKey = formData.panelvanEngine || '1900_altı';
        if (isElectric) {
            panelKey = (panelKey === '116_üstü') ? '1901_üstü' : '1900_altı';
        }
        const key = 'panelvan_' + panelKey;
        if (tarife_II_2026[key]) tax = tarife_II_2026[key][age];
        if (isElectric) tax = Math.floor(tax / 4);
    }
    else if (baseType === 'minibus' || baseType === 'otobus') {
        const seatKey = formData.vehicleSeat || (baseType === 'minibus' ? '0_17' : '0_25');
        let key = 'minibus';

        if (baseType === 'minibus') {
            if (seatKey === '0_17') key = 'minibus';
            else if (seatKey === '18_25') key = 'otobus_25';
            else if (seatKey === '26_35') key = 'otobus_26_35';
            else if (seatKey === '36_45') key = 'otobus_36_45';
            else if (seatKey === '46_üstü') key = 'otobus_46_üstü';
        } else {
            if (seatKey === '0_25') key = 'otobus_25';
            else if (seatKey === '26_35') key = 'otobus_26_35';
            else if (seatKey === '36_45') key = 'otobus_36_45';
            else if (seatKey === '46_üstü') key = 'otobus_46_üstü';
            else key = 'otobus_25';
        }

        if (tarife_II_2026[key]) tax = tarife_II_2026[key][age];
        if (isElectric) tax = Math.floor(tax / 4);
    }
    else if (baseType === 'ucak' || baseType === 'helikopter') {
        const key = formData.vehicleWeight || '1150_altı';
        if (tarife_IV_2026[key]) {
            tax = tarife_IV_2026[key][age] || 0;
        }
        if (isElectric) tax = Math.floor(tax / 4);
    }

    const formatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
    const formatInst = (val) => new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: val % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    }).format(val);

    const inst = tax / 2;

    return {
        success: true,
        total: formatter.format(tax),
        inst1: formatInst(inst),
        inst2: formatInst(inst)
    };
}

// Helpers moved from app.js
function calculatePRE2018(ccKey, ageGroup) {
    if (typeof PRE_2018_RATES === 'undefined') return 0;
    const bracket = PRE_2018_RATES[ccKey];
    if (!bracket) return 0;
    const ageKey = 'y' + ageGroup.replace('-', '_').replace('+', '_plus');
    return bracket[ageKey] || 0;
}

function mapPowerToEngine(powerVal) {
    if (!powerVal) return '1300_altı';
    if (powerVal === '0_70') return '1300_altı';
    if (powerVal === '71_85') return '1301_1600';
    return '1601_1800';
}

function mapMotoPowerToEngine(val) {
    const mapping = {
        "0_6": "0_99",
        "7_15": "100_250",
        "16_40": "251_650",
        "41_60": "651_1200",
        "61_üstü": "1201_üstü"
    };
    return mapping[val] || "100_250";
}
