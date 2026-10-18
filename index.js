const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Aki } = require('akinator-api');

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// تخزين جلسات اللعب لكل مستخدم
const sessions = new Map();

// 1. التحقق من الـ Webhook
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. استقبال الرسائل من مسنجر
app.post('/webhook', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            const senderPsid = webhookEvent.sender.id;

            if (webhookEvent.message && webhookEvent.message.text) {
                handleMessage(senderPsid, webhookEvent.message.text.trim());
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// 3. إدارة لعبة المارد السحري
async function handleMessage(senderPsid, text) {
    let session = sessions.get(senderPsid);

    if (text.toLowerCase() === 'ابدأ' || text.toLowerCase() === 'start' || !session) {
        try {
            const aki = new Aki({ region: 'ar' });
            await aki.start();
            sessions.set(senderPsid, aki);

            sendTextMessage(senderPsid, `مرحباً بك في المارد السحري! 🧞‍♂️\nفكر في شخصية وسأحاول تخمينها.\n\nالسؤال 1:\n${aki.question}\n\nاختر رقماً للإجابة:\n0: نعم\n1: لا\n2: لا أعرف\n3: ربما\n4: ربما لا`);
        } catch (error) {
            console.error(error);
            sendTextMessage(senderPsid, 'حدث خطأ أثناء بدء اللعبة، أرسل "ابدأ" للمحاولة مجدداً.');
        }
        return;
    }

    const answer = parseInt(text);
    if (isNaN(answer) || answer < 0 || answer > 4) {
        sendTextMessage(senderPsid, 'الرجاء إرسال رقم صحيح للإجابة:\n0: نعم\n1: لا\n2: لا أعرف\n3: ربما\n4: ربما لا');
        return;
    }

    try {
        await session.step(answer);

        if (session.progress >= 80 || session.currentStep >= 79) {
            await session.win();
            const guess = session.answers[0];
            
            sendTextMessage(senderPsid, `أعتقد أن الشخصية التي تفكر فيها هي:\n✨ ${guess.name} ✨\n(${guess.description})\n\nأرسل "ابدأ" للعب من جديد!`);
            sessions.delete(senderPsid);
        } else {
            sendTextMessage(senderPsid, `السؤال ${session.currentStep + 1}:\n${session.question}\n\n0: نعم | 1: لا | 2: لا أعرف | 3: ربما | 4: ربما لا`);
        }
    } catch (error) {
        console.error(error);
        sendTextMessage(senderPsid, 'حدث خطأ في اللعبة، أرسل "ابدأ" للبدء من جديد.');
        sessions.delete(senderPsid);
    }
}

function sendTextMessage(senderPsid, text) {
    const requestBody = {
        "recipient": { "id": senderPsid },
        "message": { "text": text }
    };

    axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, requestBody)
        .catch(err => console.error('Error sending message:', err.response?.data || err.message));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
