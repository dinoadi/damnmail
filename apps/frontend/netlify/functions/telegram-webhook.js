const APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1'

exports.handler = async (event) => {
  try {
    const response = await fetch(`${APPWRITE_ENDPOINT}/functions/telegram-bot/executions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': 'damnmail',
      },
      body: JSON.stringify({ body: event.body || '' }),
    })
    const data = await response.json()
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    }
  }
}
