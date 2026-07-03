const APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1'

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: ''
      }
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Method Not Allowed' })
      }
    }

    const clientPayload = JSON.parse(event.body || '{}')

    const executionPayload = {
      async: false,
      path: clientPayload.path || '/',
      method: clientPayload.method || 'GET',
      body: clientPayload.body || '',
      headers: {
        'content-type': 'application/json'
      }
    }

    const response = await fetch(`${APPWRITE_ENDPOINT}/functions/api/executions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': 'damnmail'
      },
      body: JSON.stringify(executionPayload)
    })

    const executionResult = await response.json()

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify(executionResult)
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
