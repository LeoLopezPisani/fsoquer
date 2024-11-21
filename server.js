/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import "dotenv/config.js";
import express, { text } from "express";
import axios from "axios";
import { createRequire } from 'module';  // Import createRequire from 'module'

// Use createRequire to get access to CommonJS `require`
const require = createRequire(import.meta.url);

// Import the CommonJS module
const db = require('./db.cjs');

const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN } = process.env;
const PORT = process.env.PORT || 1212;

app.post("/", async (req, res) => {
  // log incoming messages
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));
  
  // check if the webhook request contains a message
  // details on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const type = message?.type;
  // extract the business number to send the reply from it
  const business_phone_number_id =
    req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;

  // check if the incoming message contains text
  if (type === "text") {
    const numStr = message?.from.toString();
    //console.log(numStr);
    let numFiltered = numStr.replace("9", "");
    //console.log(numFiltered);
    console.log("sending Bienvenida to " + numFiltered);
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v21.0/${business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        to: +numFiltered,
        type: "interactive",
        interactive: {
          type: "list",
          body: {
            text: "Hola! soy Fsoquer, tu bot amigo de sociales. ¿Con qué te puedo ayudar hoy?"
          },
          "action": {
            "sections": [
              {
                "title": "¿Qué necesitás hoy?",
                "rows": [
                  {
                    "id": "1",
                    "title": "Calendario"
                  },
                  {
                    "id": "2",
                    "title": "Oferta Académica"
                  },
                  {
                    "id": "3",
                    "title": "Plan de Estudios"
                  },
                  {
                    "id": "4",
                    "title": "Trámites"
                  },
                  {
                    "id": "5",
                    "title": "Otra consulta"
                  }
                ]
              }
            ],
            "button": "Elegir",
          }
        }
      },
    });

    ReadMessage(business_phone_number_id, message?.id);
  }

  if (type === "interactive") {
    console.log("Processing reply message");
    const numStr = message?.from.toString();
    //console.log(numStr);
    let numFiltered = numStr.replace("9", "");
    //console.log(numFiltered);
    const msgId = message.interactive.list_reply.id;

    db.getTemplateByFilter("nid", msgId, (err, templates) => {
      if(err){
        return console.error('Error retrieving template by nid:', err.message);
      }
      console.log('Template with NId ' + msgId);
      // templates.forEach(template => {
      //   console.log(`${template.id}: ${template.descripcion} | tipo: ${template.tipo}`)
      // })

      var template = templates[0];

      const options = template.options.split(',');
      
      switch(template.type) {
        case "buttons":
          //SendButtonsMessage();
          SendListMessage(template.body, options, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          break;
        case "list":
          SendListMessage(template.body, options, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          break;
        case "text":
          SendTextMessage();
          ReadMessage(business_phone_number_id, message?.id);
          break;
        default:
          SendTextMessage();
          ReadMessage(business_phone_number_id, message?.id);
          break;
      };
    });
    
  }


  res.sendStatus(200);
});

// accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // check the mode and token sent are correct
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    // respond with 200 OK and challenge token from the request
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    // respond with '403 Forbidden' if verify tokens do not match
    res.sendStatus(403);
  }
});

app.get("/bla", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT, err => {
  if (err) {
    return console.error(err);
  }
  return console.log(`Server is listening on port: ${PORT}`);
});


async function ReadMessage(nbr, id) {
  // mark incoming message as read
  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v21.0/${nbr}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: id,
    },
  });
}

async function SendButtonsMessage() {
  console.log("Sending Buttons Message");
}

async function SendListMessage(bodyText, options, destNumber, businessNumber) {
  console.log("Sending List Message");

  const data = {
    messaging_product: "whatsapp",
    to: destNumber,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: `${bodyText}`
      },
      action: {
          sections: [
            {
              title: "¿Qué necesitás hoy?",
              rows: []
            }
          ],
          button: "Elegir",
        }
    }
  };

  var fe = new Promise((resolve, reject) => {
    options.forEach((option, index, array) => {
    
      db.getTemplateByFilter("nid", option, (err, templates) => {
        if(err){
          return console.error('Error retrieving template by nid:', err.message);
        }
        console.log('Template with NId ' + option);
        templates.forEach(template => {
          console.log(`${template.id}: ${template.description} | tipo: ${template.type}`)
          
          var obj = {
            id: template.nid,
            title: template.description
          };
    
          data.interactive.action.sections[0].rows.push(obj);
          if (index === array.length -1) resolve();
        });
      });
    });
  });
  
  
  fe.then(() => {
    console.log(`About to post data ${JSON.stringify(data)}`);
    SendMessage(businessNumber, data);
  })
}

async function SendTextMessage() {
  console.log("Sending Text Message");
}

async function SendMessage(businessNumber, data) {
  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v21.0/${businessNumber}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: data,
  });
}

