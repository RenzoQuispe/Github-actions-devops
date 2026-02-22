const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'lab03-1-table1';

/**
 * Lambda que escribe y lista eventos en DynamoDB (ejemplo realista, Free Tier).
 * Payload: { action: "putEvent" | "listEvents", body?: { eventType, source, ... } }
 */
exports.handler = async (event) => {
  const action = event && event.action;
  const body = event && event.body;

  try {
    if (action === 'putEvent') {
      const eventId = body?.eventId || require('crypto').randomUUID();
      const item = {
        eventId,
        eventType: body?.eventType || 'event',
        source: body?.source || 'unknown',
        timestamp: new Date().toISOString(),
        ...body,
      };
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }));
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Evento guardado',
          eventId,
          timestamp: item.timestamp,
        }),
      };
    }

    if (action === 'listEvents') {
      const limit = Math.min(Math.max(parseInt(body?.limit, 10) || 10, 1), 100);
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        Limit: limit,
      }));
      const items = (result.Items || []).sort(
        (a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')
      );
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Listado de eventos',
          count: items.length,
          events: items,
        }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Acción no válida',
        expected: ['putEvent', 'listEvents'],
      }),
    };
  } catch (err) {
    console.error('DynamoDB error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error en DynamoDB',
        message: err.message,
      }),
    };
  }
};
