const { default: makeWASocket, useMultiFileAuthState} = require("baileys");
const { downloadMediaMessage } = require('baileys');
const Pino = require("pino");
const QRCode = require('qrcode');
const axios = require('axios');

async function connectToWhatsApp () {
    var logIn = 0;
    const auth = await useMultiFileAuthState('auth');
    const sock = makeWASocket({
        auth: auth.state,
        logger: Pino ({level:"silent"}),
    });

    sock.ev.on('creds.update', auth.saveCreds);
    sock.ev.on('connection.update', async (update) => {
        const {qr, connection, lastDisconnect } = update;
        if (qr) {
            if (logIn != 1) {
                console.log('Generating resized QR code...');
                QRCode.toFile('qrcode.png', qr, {
                    width: 50, 
                }, function (err) {
                    if (err) throw err;
                    console.log('QR code saved as qrcode.png');
                });
                logIn = 1;
            }
        }
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== 428) {
                connectToWhatsApp();
            } else {
                console.log('Logout :');
            }
        } else if (connection === 'open') {
            console.log("Connected on " + sock.user.id.split(":")[0]);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        console.log(msg);
    
        // Ignore messages sent by yourself or non-notify types
        if (msg.key.fromMe || m.type !== 'notify') return;
    
        // Check if the message is from a group
        const isGroup = msg.key.remoteJid.endsWith('@g.us');
    
        console.log(`Message is from a ${isGroup ? 'group' : 'private chat'}`);
    
        let receivedText = '';
        let mentionedMe = false;
        let isImage = false;

        if (msg.message) {

            if (msg.message.conversation) {
                receivedText = msg.message.conversation.toLowerCase();
            } else if (msg.message.extendedTextMessage) {
                const extendedMessage = msg.message.extendedTextMessage;
                receivedText = extendedMessage.text.toLowerCase();
    
                // Check if the bot is mentioned
                if (extendedMessage.contextInfo && extendedMessage.contextInfo.mentionedJid) {
                    const mentionedJids = extendedMessage.contextInfo.mentionedJid;
                    console.log('Mentioned JIDs:', mentionedJids);
    
                    if (mentionedJids.includes(sock.user.id)) {
                        mentionedMe = true;
                    } else {
                        if (mentionedJids[0] == '6285731866606@s.whatsapp.net') {
                            mentionedMe = true;
                        } else {
                            mentionedMe = false
                        }
                    }

                    
                }
            }
        }
    
        if (isGroup) {

            if (msg.message.imageMessage) {
                isImage = true;
                receivedText = msg.message.imageMessage.caption;
            }

            if (receivedText) {
                const regex = /\b(IT|pa it|Mas IT|Bpk IT|Bpkit|ms it|mas it|pk it|pakit|Mas IT,|Mas IT.|Pak IT|Pak IT,|Pak IT.|Bapak IT|Bapak IT,|Bapak IT.|Tim IT)\b/i;
                
                if (regex.test(receivedText) || mentionedMe) { 
                    
                    if (isImage) {

                        try {
                            const mediaBuffer = await downloadMediaMessage(
                                msg,                         
                                'buffer',                     // Format hasil download (buffer)
                                {},                           // Opsi tambahan (kosongkan jika tidak diperlukan)
                                { logger: console }           // Logger
                            );
                    
                            const base64Image = mediaBuffer.toString('base64');  // Ubah buffer ke base64
                    
                            const response = await axios.post('http://127.0.0.1:5000/api-img', {
                                image: base64Image,    
                                caption: receivedText,  
                                sender: msg.key.remoteJid 
                            });
                    
                            await sock.sendMessage(msg.key.remoteJid, {
                                text: `@${msg.key.participant.split('@')[0]}, Langkah-langkahnya seperti berikut:`,
                                mentions: [msg.key.participant]
                                }, { quoted: msg }
                            );
                            await sock.sendMessage(msg.key.remoteJid, {
                                text: `${response.data.respons}`,
                            });  
                            
                        } catch (error) {
                            console.error('Gagal mengirim gambar ke API:', error);
                        }

                    } else {

                        try {
                            console.log('Success sending to Flask')
                            
                            const response = await axios.post('http://127.0.0.1:5000/api-txt', {
                                text: receivedText,
                            });
    
                            console.log(response.data)
    
                            if(response.data.tag == 'appdev' && response.data.status == 'sfa') {
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `@${msg.key.participant.split('@')[0]}, Langkah-langkahnya seperti berikut:`,
                                    mentions: [msg.key.participant]
                                    }, { quoted: msg }
                                );
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `${response.data.respons}`,
                                });    
                            } 
    
                            if (response.data.tag == 'ts' && response.data.status == 'sfa') {
                                const mentionTs = [
                                    '6281230016744@s.whatsapp.net', 
                                    '6281330074779@s.whatsapp.net', 
                                    '6285335891062@s.whatsapp.net'
                                ];
                            
                                const mentionTextTs = mentionTs.map(user => `@${user.split('@')[0]}`).join(' ');
                            
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `${response.data.respons}, ${mentionTextTs}`,
                                    mentions: mentionTs
                                }, { quoted: msg });
                            }
    
                            if (response.data.tag == 'appdev' && response.data.status == 'non_sfa') {
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `${response.data.respons}`,
                                    mentions: [msg.key.participant]
                                    }, { quoted: msg }
                                );
                            }
    
                            if (response.data.tag == 'other' && response.data.status == 'non_sfa') {
                                const mentionAppdev = [
                                    '6285156566857@s.whatsapp.net',
                                    '6285784378960@s.whatsapp.net'
                                ];
    
                                const mentionTextAppdev = mentionAppdev.map(user => `@${user.split('@')[0]}`).join(' ');
    
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `${response.data.respons}, ${mentionTextAppdev}`,
                                    mentions: mentionAppdev
                                    }, { quoted: msg }
                                );
                            }
    
                            if (response.data.tag == 'rule' && response.data.status == 'non_sfa') {
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `${response.data.respons}`,
                                    mentions: [msg.key.participant]
                                    }, { quoted: msg }
                                );
                            }
        
                        } catch (error) {
                            console.error('Error sending to Flask:', error.message);
                        }    

                    }

                } else {
                    console.log('Bot was not mentioned or no keyword matched. No action taken.');
                }
            }            
        } else {
            console.log('Private chat')
        }
    });
    
    
}

connectToWhatsApp();
