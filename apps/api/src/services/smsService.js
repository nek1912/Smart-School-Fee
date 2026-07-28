const axios = require('axios');

const SMS_PROVIDERS = {
  MOCK: 'mock',
  MSG91: 'msg91',
  TWILIO: 'twilio',
  TEXTLOCAL: 'textlocal'
};

class SmsService {
  constructor() {
    this.provider = (process.env.SMS_PROVIDER || SMS_PROVIDERS.MOCK).toLowerCase();
  }

  async sendOtp(mobile, otp) {
    // Mock mode - just log OTP, don't send SMS
    if (this.provider === SMS_PROVIDERS.MOCK || process.env.SMS_ENABLED === 'false') {
      console.log(`\n========================================`);
      console.log(`[MOCK SMS] OTP for ${mobile}: ${otp}`);
      console.log(`========================================\n`);
      return { success: true, provider: 'mock', messageId: 'mock-' + Date.now() };
    }

    switch (this.provider) {
      case SMS_PROVIDERS.MSG91:
        return this.sendViaMsg91(mobile, otp);
      case SMS_PROVIDERS.TWILIO:
        return this.sendViaTwilio(mobile, otp);
      case SMS_PROVIDERS.TEXTLOCAL:
        return this.sendViaTextLocal(mobile, otp);
      default:
        return this.sendViaMsg91(mobile, otp);
    }
  }

  async sendViaMsg91(mobile, otp) {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey) {
      throw new Error('MSG91_AUTH_KEY not configured');
    }

    if (!templateId) {
      throw new Error('MSG91_TEMPLATE_ID not configured. Create a template in MSG91 Dashboard → SendOTP → Templates');
    }

    // Clean mobile number - remove +, spaces, dashes
    const cleanMobile = mobile.replace(/[^0-9]/g, '');
    
    // Ensure mobile has country code (91 for India)
    const mobileWithCountryCode = cleanMobile.startsWith('91') && cleanMobile.length === 12 
      ? cleanMobile 
      : `91${cleanMobile}`;

    // MSG91 OTP API - Uses control.msg91.com endpoint with DLT template
    const url = `https://control.msg91.com/api/v5/otp`;
    const payload = {
      mobile: mobileWithCountryCode,
      otp: otp,
      authkey: authKey,
      template_id: templateId
    };

    console.log(`[SMS] Sending OTP to ${mobileWithCountryCode} via MSG91 with template: ${templateId}`);

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`[SMS] MSG91 response:`, response.data);
      
      // Check if MSG91 returned success
      if (response.data.type === 'success' || response.data.message === 'success') {
        return { success: true, provider: 'msg91', messageId: response.data.message };
      } else {
        throw new Error(response.data.message || 'MSG91 returned unexpected response');
      }
    } catch (error) {
      console.error('[SMS] MSG91 OTP failed:', error.response?.data || error.message);
      if (error.response?.data) {
        console.error('[SMS] MSG91 error details:', JSON.stringify(error.response.data));
      }
      throw new Error(`Failed to send OTP via MSG91: ${error.message}`);
    }
  }

  async sendViaTwilio(mobile, otp) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured. Get free trial at https://www.twilio.com/try-twilio');
    }

    // Clean mobile number
    const cleanMobile = mobile.replace(/[^0-9]/g, '');
    const mobileWithCountryCode = cleanMobile.startsWith('91') && cleanMobile.length === 12 
      ? cleanMobile 
      : `91${cleanMobile}`;

    const message = `Your Smart School Fintech OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const payload = new URLSearchParams({
      To: `+${mobileWithCountryCode}`,
      From: fromNumber,
      Body: message
    });

    console.log(`[SMS] Sending OTP to +${mobileWithCountryCode} via Twilio`);

    try {
      const response = await axios.post(url, payload, {
        auth: {
          username: accountSid,
          password: authToken
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      console.log(`[SMS] Twilio response:`, response.data.sid);
      return { success: true, provider: 'twilio', messageId: response.data.sid };
    } catch (error) {
      console.error('[SMS] Twilio failed:', error.response?.data || error.message);
      throw new Error(`Failed to send OTP via Twilio: ${error.message}`);
    }
  }

  async sendViaTextLocal(mobile, message) {
    const apiKey = process.env.TEXTLOCAL_API_KEY;
    const sender = process.env.TEXTLOCAL_SENDER || 'SSFSCH';

    if (!apiKey) {
      throw new Error('TEXTLOCAL_API_KEY not configured');
    }

    const url = 'https://api.textlocal.in/send/';
    const payload = {
      apikey: apiKey,
      numbers: `91${mobile}`,
      message: message,
      sender: sender
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return { success: true, provider: 'textlocal', messageId: response.data.messages?.[0]?.id };
    } catch (error) {
      console.error('TextLocal SMS failed:', error.response?.data || error.message);
      throw new Error(`Failed to send OTP via TextLocal: ${error.message}`);
    }
  }
}

module.exports = new SmsService();
