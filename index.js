const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore,
    downloadContentFromMessage,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys')

const pino = require('pino')
const fs = require('fs')
const chalk = require('chalk')
const fetch = require('node-fetch')
const readline = require('readline')

// === FUNCTION INPUT (untuk pairing code) ===
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))
const usePairingCode = true;
// === CONTOH CONTACT MODE ===
const warmodes = {
    key: {
        participant: `13135559098@s.whatsapp.net`,
        remoteJid: "13135559098@s.whatsapp.net",
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`
    },
    message: {
        contactMessage: {
            displayName: `𝑊𝑎𝑅 𝑀𝑜𝑑𝑒 ( 𝐴𝑐𝑡𝑖𝑣𝑒 )`,
            vcard: true,
            thumbnailUrl: `https://files.catbox.moe/6y35hh.jpg`,
            sendEphemeral: true
        }
    },
    status: 1,
    participant: "13135559098@s.whatsapp.net"
}

// === START CLIENT ===
async function clientstart() {
    const { state, saveCreds } = await useMultiFileAuthState("session")

    const conn = makeWASocket({
        printQRInTerminal: !usePairingCode,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        generateHighQualityLinkPreview: true,
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage
            )
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {}
                            },
                            ...message
                        }
                    }
                }
            }
            return message
        },
        version: (await (await fetch(
            'https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json'
        )).json()).version,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        logger: pino({ level: 'fatal' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent', stream: 'store' }))
        }
    })

    // Pairing Code
    if (!conn.authState.creds.registered) {
        const phoneNumber = await question('Masukkan nomor WhatsApp kamu (contoh: 62xxx):\n')
        const code = await conn.requestPairingCode(phoneNumber.trim())
        console.log(chalk.blue.bold(`🔑 Kode Pairing Kamu: ${code}`))
    }

    const store = makeInMemoryStore({
        logger: pino().child({ level: 'silent', stream: 'store' })
    })
    store.bind(conn.ev)

    conn.ev.on('creds.update', saveCreds)

    // === PESAN MASUK ===
    conn.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0]
            if (!msg.message || msg.key.fromMe) return

            const from = msg.key.remoteJid
            const type = Object.keys(msg.message)[0]
            const pesan =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message[type]?.caption ||
                ''

            const command = pesan.trim().split(' ')[0].toLowerCase()
            console.log(`[Pesan dari ${from}]: ${pesan}`)

            switch (command) {
                case 'menu': {
          const quotes = [
            "Hidup adalah perjalanan, bukan tujuan.",
            "Jangan menyerah, setiap usaha pasti ada hasil.",
            "Sukses adalah hasil dari kerja keras.",
            "Hari ini lebih baik dari kemarin.",
            "Tetap semangat, masa depan menunggu!"
          ];
          const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        
          const menuMessage = {
            text: `╭───❍ VonzieBot ❍───╮
        │
        │  乂  *MENU BOT*
        │
        │  ✦ !menu
        │  ✦ !ping
        │  ✦ !sticker
        │  ✦ !owner
        │
        │  ✦ *Quote Hari Ini:*
        │    "${randomQuote}"
        │
        ╰───────────────❍`
          };
        
          await conn.sendMessage(from, menuMessage, { quoted: warmodes });
        }
                    break

                case 'halo':
                    await conn.sendMessage(from, { text: 'Halo juga! 👋' })
                    break

                case 'sticker':
                    if (msg.message.imageMessage || msg.message.videoMessage) {
                        const buffer = []
                        const typeMsg = msg.message.imageMessage ? 'image' : 'video'
                        const stream = await downloadContentFromMessage(
                            msg.message[typeMsg + 'Message'],
                            typeMsg
                        )
                        for await (const chunk of stream) buffer.push(chunk)
                        const file = Buffer.concat(buffer)

                        await conn.sendMessage(from, {
                            sticker: file,
                            packname: "Vonzie Pack",
                            author: "Vonzie Bot"
                        })
                    } else {
                        await conn.sendMessage(from, {
                            text: '❌ Kirim gambar/video dengan caption *sticker* untuk dijadikan stiker 📸'
                        })
                    }
                    break

                default:
                    // ignore selain command
                    break
            }

            // === FITUR EVAL (Owner only) ===
            const budy = pesan
            const isOwner = from.endsWith('@s.whatsapp.net') // ganti validasi owner sesuai nomor lo
            if (budy.startsWith('>') && isOwner) {
                try {
                    let evaled = await eval(budy.slice(1))
                    if (typeof evaled !== 'string') evaled = require('util').inspect(evaled)
                    await conn.sendMessage(from, { text: evaled })
                } catch (err) {
                    await conn.sendMessage(from, { text: String(err) })
                }
            }
        } catch (err) {
            console.log(require("util").format(err))
        }
    })
}

// === AUTO RELOAD SCRIPT ===
let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log('\x1b[0;32m' + __filename + ' \x1b[1;32mupdated!\x1b[0m')
    delete require.cache[file]
    require(file)
})

clientstart()
