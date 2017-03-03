let TelegramBot = require('node-telegram-bot-api')
let cheerio = require('cheerio')
let request = require('request')
let params = require('./params')

const token = params.botToken
const musixmath_key = params.musixmathKey

let bot = new TelegramBot(token, { polling: true })

let users = {}

bot.on('callback_query', (data) => {
    if (!users[data.message.chat.id]) {
        users[data.message.chat.id] = {
            waiting_artist: false,
            waiting_track: false,
            is_loading: false,
        }
    }

    if (!data.data) {
        bot.answerCallbackQuery(data.id)
        return
    }

    let params = JSON.parse(data.data)

    if (params.method == 'start') {
        callbackStart(data, params)
    } else if (params.method == 'track') {
        callbackTrack(data, params)
    }
})

bot.on('message', (msg) => {
    if (!users[msg.chat.id]) {
        users[msg.chat.id] = {
            waiting_artist: false,
            waiting_track: false,
            is_loading: false,
        }
    }

    if (users[msg.chat.id].is_loading) {
        return
    } else {
        users[msg.chat.id].is_loading = true
    }

    if (msg.text.indexOf('play.google.com') != -1 && msg.text.indexOf('t=') != -1) {
        parseGoogleMusicLink(msg)
    } else if (msg.text == '/start') {
        users[msg.chat.id].is_loading = false

        startSearch(msg)
    } else if (users[msg.chat.id].waiting_artist) {
        searchByArtist(msg)
    } else if (users[msg.chat.id].waiting_track) {
        searchByTrack(msg)
    } else {
        users[msg.chat.id].waiting_track = true
        searchByTrack(msg)
    }
})

let callbackTrack = (data, params) => {
    bot.answerCallbackQuery(data.id, 'Идет поиск')

    request(`http://api.musixmatch.com/ws/1.1/track.lyrics.get?apikey=59b49765ac4120c11a9e4aeb7c0128a1&track_id=${params.track_id}`, (error, response, body) => {
        let json = JSON.parse(body)

        if (!json.message || !json.message.body || !json.message.body.lyrics) {
            bot.sendMessage(data.message.chat.id, `Ошибка при запросе в базе данных`)
            return
        }

        bot.sendMessage(data.message.chat.id, json.message.body.lyrics.lyrics_body)
    })
}

let callbackStart = (data, params) => {
    users[data.message.chat.id].waiting_artist = false
    users[data.message.chat.id].waiting_track = false

    if (params.type == 'artist') {
        users[data.message.chat.id].waiting_artist = true
        bot.answerCallbackQuery(data.id, 'Введите имя артиста')

    } else if (params.type == 'track') {
        users[data.message.chat.id].waiting_track = true
        bot.answerCallbackQuery(data.id, 'Введите название песни')
    }
}

let startSearch = (msg) => {
    bot.sendMessage(msg.chat.id, 'Как вы хотите искать:', {
        reply_markup: {
            inline_keyboard: [
                [{
                    text: `По имени артиста`,
                    callback_data: JSON.stringify({ method: 'start', type: 'artist' })
                }],
                [{
                    text: `По названию песни`,
                    callback_data: JSON.stringify({ method: 'start', type: 'track' })
                }]
            ]
        }
    })
}

let parseGoogleMusicLink = (msg) => {
    bot.sendMessage(msg.chat.id, 'Идет поиск')

    let text = msg.text

    let query = null
    text.split(`?`).forEach((item, i) => {
        let temp = item.split('=')

        if (temp[0] == 't' && temp.length > 1) {
            query = temp[1].split('_-_')
        }
    })

    if (!query) {
        bot.sendMessage(msg.chat.id, `Google Music запрос не распознан`)
        return
    }

    let url = `http://api.musixmatch.com/ws/1.1/track.search?apikey=${musixmath_key}&page_size=10&page=1&s_track_rating=desc&q_track=${query[0]}`

    request(url, (error, response, body) => {
        searchCallback(msg, body)
    })
}

let searchByArtist = (msg) => {
    bot.sendMessage(msg.chat.id, 'Идет поиск')

    let url = `http://api.musixmatch.com/ws/1.1/track.search?apikey=${musixmath_key}&page_size=10&page=1&s_track_rating=desc&q_artist=${msg.text}`

    request(url, (error, response, body) => {
        users[msg.chat.id].waiting_artist = false
        searchCallback(msg, body)
    })
}

let searchByTrack = (msg) => {
    bot.sendMessage(msg.chat.id, 'Идет поиск')

    let url = `http://api.musixmatch.com/ws/1.1/track.search?apikey=${musixmath_key}&page_size=10&page=1&s_track_rating=desc&q_track=${msg.text}`

    request(url, (error, response, body) => {
        users[msg.chat.id].waiting_track = false
        searchCallback(msg, body)
    })
}

let searchCallback = (msg, body) => {
    users[msg.chat.id].is_loading = false

    let json = JSON.parse(body)

    if (!json.message) {
        bot.sendMessage(msg.chat.id, `Ошибка при запросе в базе данных`)
        return
    }

    if (json.message.header.available == 0) {
        bot.sendMessage(msg.chat.id, `Ничего не найдено`)
        return
    }

    let buttons = json.message.body.track_list.map(({ track }, i) => {
        return [{
            text: `${track.track_name} - ${track.artist_name}`,
            callback_data: JSON.stringify({ method: 'track', track_id: track.track_id })
        }]
    })

    bot.sendMessage(msg.chat.id, 'Выберете песню', {
        reply_markup: {
            inline_keyboard: buttons
        }
    });
}