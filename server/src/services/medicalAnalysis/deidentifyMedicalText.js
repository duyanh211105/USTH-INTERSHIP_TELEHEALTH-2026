const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const phonePattern = /(?<!\d)(?:\+?84[\s.-]?)?(?:0|\(?0\)?[\s.-]?)?(?:3|5|7|8|9)(?:[\s.-]?\d){8}(?!\d)/g;
const labeledIdPattern = /\b((?:Citizen\s+ID|National\s+ID|ID|CCCD|CMND|So\s+CCCD|Số\s+CCCD|So\s+CMND|Số\s+CMND)\s*[:#-]?\s*)(0\d{8,11})(?!\d)/giu;
const nextLabeledFieldPattern = String.raw`(?=\s+(?:Patient(?:\s+Name)?|Full\s+Name|Name|Ho\s+ten|Họ\s+tên|Ten\s+benh\s+nhan|Tên\s+bệnh\s+nhân|Benh\s+nhan|Bệnh\s+nhân|Phone|Contact\s+phone|Email|Citizen\s+ID|National\s+ID|ID|CCCD|CMND|Address|Permanent\s+Address|Dia\s+chi|Địa\s+chỉ|Symptoms?|Age|Gender|Medication|Medications|Allerg(?:y|ies)|History|Glucose|Blood\s+pressure|Date)\s*[:#-]|$)`;
const nameLabelPattern = new RegExp(String.raw`\b((?:Patient(?:\s+Name)?|Full\s+Name|Name|Ho\s+ten|Họ\s+tên|Ten\s+benh\s+nhan|Tên\s+bệnh\s+nhân|Benh\s+nhan|Bệnh\s+nhân)\s*:\s*)(.+?)${nextLabeledFieldPattern}`, 'giu');
const addressLabelPattern = new RegExp(String.raw`\b((?:Address|Permanent\s+Address|Dia\s+chi|Địa\s+chỉ)\s*:\s*)(.+?)${nextLabeledFieldPattern}`, 'giu');

function createTracker() {
  const detectedTypes = [];
  const seenTypes = new Set();
  let maskedCount = 0;

  return {
    mark(type) {
      maskedCount += 1;
      if (!seenTypes.has(type)) {
        seenTypes.add(type);
        detectedTypes.push(type);
      }
    },
    result(text) {
      return {
        text,
        detectedTypes,
        maskedCount,
      };
    },
  };
}

function maskLabeledValue(text, pattern, type, placeholder, tracker) {
  return text.replace(pattern, (match, label) => {
    tracker.mark(type);
    return `${label}${placeholder}`;
  });
}

function maskSimplePattern(text, pattern, type, placeholder, tracker) {
  return text.replace(pattern, () => {
    tracker.mark(type);
    return placeholder;
  });
}

export function deidentifyMedicalText(text = '') {
  const tracker = createTracker();
  let maskedText = String(text || '');

  maskedText = maskSimplePattern(maskedText, emailPattern, 'email', '[EMAIL]', tracker);
  maskedText = maskLabeledValue(maskedText, nameLabelPattern, 'patient_name', '[PATIENT_NAME]', tracker);
  maskedText = maskLabeledValue(maskedText, addressLabelPattern, 'address', '[ADDRESS]', tracker);
  maskedText = maskLabeledValue(maskedText, labeledIdPattern, 'id_number', '[ID_NUMBER]', tracker);
  maskedText = maskSimplePattern(maskedText, phonePattern, 'phone', '[PHONE]', tracker);

  return tracker.result(maskedText);
}
