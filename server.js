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

let globalFilter = [];

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

  // check if the incoming message contains text | TO DO: ESTE IF DEBERÍA EJECUTARSE EN UNA LLAMADA A LAS FUNCIONES ESTÁNDAR QUE CREAMOS
  if (type === "text") {
    const numStr = message?.from.toString();
    //console.log(numStr);
    let numFiltered = numStr.replace("9", "");
    //console.log(numFiltered);
    console.log("sending Bienvenida to " + numFiltered);

    SendListMessage("Hola! soy Fsoquer, tu bot amigo de sociales. ¿Con qué te puedo ayudar hoy?", ["1", "2", "3", "4"], +numFiltered, business_phone_number_id);
    // await axios({
    //   method: "POST",
    //   url: `https://graph.facebook.com/v21.0/${business_phone_number_id}/messages`,
    //   headers: {
    //     Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    //   },
    //   data: {
    //     messaging_product: "whatsapp",
    //     to: +numFiltered,
    //     type: "interactive",
    //     interactive: {
    //       type: "list",
    //       body: {
    //         text: "Hola! soy Fsoquer, tu bot amigo de sociales. ¿Con qué te puedo ayudar hoy?"
    //       },
    //       "action": {
    //         "sections": [
    //           {
    //             "title": "¿Qué necesitás hoy?",
    //             "rows": [
    //               {
    //                 "id": "1",
    //                 "title": "Calendario"
    //               },
    //               {
    //                 "id": "2",
    //                 "title": "Oferta Académica"
    //               },
    //               {
    //                 "id": "3",
    //                 "title": "Plan de Estudios"
    //               },
    //               {
    //                 "id": "4",
    //                 "title": "Trámites"
    //               },
    //               {
    //                 "id": "5",
    //                 "title": "Otra consulta"
    //               }
    //             ]
    //           }
    //         ],
    //         "button": "Elegir",
    //       }
    //     }
    //   },
    // });

    ReadMessage(business_phone_number_id, message?.id);
  }

  if (type === "interactive") {
    console.log("Processing reply message");
    const numStr = message?.from.toString();
    //console.log(numStr);
    let numFiltered = numStr.replace("9", "");
    //console.log(numFiltered);
    let msgId = null;
    if (message.interactive.type == "list_reply") {
      msgId = message.interactive.list_reply.id;
    } else {
      msgId = message.interactive.button_reply.id;
    }

    db.getTemplateByFilter("nid", msgId, (err, templates) => {
      if(err){
        return console.error('Error retrieving template by nid:', err.message);
      }
      console.log('Template with NId ' + msgId);
      // templates.forEach(template => {
      //   console.log(`${template.id}: ${template.descripcion} | tipo: ${template.tipo}`)
      // })

      var template = templates[0];
      const options = template.options != null ? template.options.split(',') : [];
      
      switch(template.type) {
        case "buttons":
          SendButtonsMessage(template.body, options, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          break;
        case "list":
          SendListMessage(template.body, options, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          break;
        case "text":
          SendTextMessage(template.body, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          break;
        case "cta":
          SendCallToActionMessage(template.body, template.url, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          break;
        case "query":
          //var queryData = null
          if (template.nid.toString().startsWith("11")) {
            var unixTs = Math.floor(Date.now() / 1000);
            var filters = [
              {
                column: "tipo",
                operator: "=",
                value: template.description
              },
              {
                column: "fecha_inicio",
                operator: ">=",
                value: unixTs
              }
            ];

            RetrieveQueryData(filters, "fechas", "fecha_inicio", "ASC", 1).then((queryData) => {
              if(queryData.length == 0) {
                text = `No tengo todavía fechas próximas de ${template.description}. Podés volver a consultarme cuando quieras!`;
              } else {
                const data = queryData[0];
                var inicio = new Date(data.fecha_inicio * 1000);
                var diaInicio = getDia(inicio);
                var fin = new Date(data.fecha_fin * 1000);
                var diaFin = getDia(fin);
    
                var text = `La próxima fecha importante en términos de ${template.description} es la siguiente: ${data.descripcion} del ${diaInicio} ${inicio.toLocaleDateString()} al ${diaFin} ${fin.toLocaleDateString()}`
              }
  
              SendTextMessage(text,+numFiltered, business_phone_number_id);
            });
          };

          ReadMessage(business_phone_number_id, message?.id);
          break;
        case "filter":
          //Add object to globalFilter array
          var obj = {
            column: template.filter_type,
            operator: "=",
            value: template.description
          }

          globalFilter.push(obj)
          SendListMessage("¿Cómo quisieras filtrar la búsqueda? Podés seleccionar todas las categorías que quieras. Cuando no quieras agregar más especificaciones a la búsqueda, seleccioná Continuar con la búsqueda.", ["121","122","123","125"], +numFiltered, business_phone_number_id);
          break;
        case "continue":
          //execute the filtering by globalFilter and send the results
          RetrieveQueryData(globalFilter, "fechas", "fecha_inicio", "ASC").then((queryData) => {
            var text = `No puedo encontrar información para la búsqueda que hiciste. Podés volver a consultarme más adelante!`;
            if (queryData.length > 0) {
              text = `La búsqueda arrojó los siguientes resultados: \n`;
          
              // Use a promise to wait for all iterations to complete
              let promises = queryData.map((data) => {
                return new Promise((resolve) => {
                  var inicio = new Date(data.fecha_inicio * 1000);
                  var diaInicio = getDia(inicio);
                  var fin = new Date(data.fecha_fin * 1000);
                  var diaFin = getDia(fin);
          
                  var dataText = `- ${data.descripcion} -> ${diaInicio} ${inicio.toLocaleDateString()} a ${diaFin} ${fin.toLocaleDateString()} \n`;
                  text = text.concat(dataText); // Concatenate each result to text
          
                  resolve(); // Resolve the promise for each item
                });
              });
          
              // Wait for all promises to resolve before sending the message
              Promise.all(promises).then(() => {
                SendTextMessage(text, +numFiltered, business_phone_number_id); // Send the message after all data is processed
                //clean global filter
                globalFilter = [];
                ReadMessage(business_phone_number_id, message?.id);
              });
            } else {
              SendTextMessage(text, +numFiltered, business_phone_number_id); // Send the message if no data found
              //clean global filter
              globalFilter = [];
              ReadMessage(business_phone_number_id, message?.id);
            }
          });
          break;
        default:
          //SendTextMessage();
          ReadMessage(business_phone_number_id, message?.id);
          break;
      };

    });
    
  }

  res.sendStatus(200);
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

async function SendButtonsMessage(bodyText, options, destNumber, businessNumber) {
  console.log("Sending Buttons Message");

  const data = {
    messaging_product: "whatsapp",
    to: destNumber,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `${bodyText}`
      },
      action: {
          buttons: []
        }
    }
  };

  var res = new Promise((resolve, reject) => {
    options.forEach((option, index, array) => {
    
      db.getTemplateByFilter("nid", option, (err, templates) => {
        if(err){
          return console.error('Error retrieving template by nid:', err.message);
        }
        console.log('Template with NId ' + option);
        templates.forEach(template => {
          console.log(`${template.id}: ${template.description} | tipo: ${template.type}`)
          
          var obj = {
            type: "reply",
            reply: {
              id: template.nid,
              title: template.description
            }
          };
    
          data.interactive.action.buttons.push(obj);
          if (index === array.length -1) resolve();
        });
      });
    });
  });
  
  
  res.then(() => {
    console.log(`About to post data ${JSON.stringify(data)}`);
    SendMessage(businessNumber, data);
  })

}

async function SendListMessage(bodyText, options, destNumber, businessNumber) {
  console.log("Sending List Message");
  //var index = 0;

  const data = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
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

  var res = new Promise((resolve, reject) => {
    // Create an array of promises from the db.getTemplateByFilter calls
    let promises = options.map((option, index, array) => {
      return new Promise((innerResolve, innerReject) => {
        db.getTemplateByFilter("nid", option, (err, templates) => {
          if (err) {
            return console.error('Error retrieving template by nid:', err.message);
          }
          //console.log('Template with NId ' + option);
          templates.forEach(template => {
            console.log(`${template.id}: ${template.description} | tipo: ${template.type}`);
            
            var obj = {
              id: template.nid.toString(),
              title: template.description
            };
  
            data.interactive.action.sections[0].rows.push(obj);
          });
          
          innerResolve(); // Resolve the inner promise after processing the templates
        });
      });
    });
  
    // Wait for all the promises to resolve
    Promise.all(promises).then(resolve).catch(reject);
  });
  
  res.then(() => {
    console.log(`About to post data ${JSON.stringify(data)}`);
    SendMessage(businessNumber, data);
  });

}

async function SendTextMessage(text, destNumber, businessNumber) {
  console.log("Sending Text Message");

  const data = {
    messaging_product: "whatsapp",
    to: destNumber,
    type: "text",
    text: {
      body: `${text}`
    }
  };

  console.log(`About to post data ${JSON.stringify(data)}`);
  SendMessage(businessNumber, data);
}

async function SendCallToActionMessage(text, url, destNumber, businessNumber) {
  console.log("Sending Call-To-Action Message");

  const data = {
    messaging_product: "whatsapp",
    to: destNumber,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: {
        text: text
      },
      action: {
        name: "cta_url",
        parameters: {
          display_text: "Descargar",
          url: url
        }
      }
    }
  };

  console.log(`About to post data ${JSON.stringify(data)}`);
  SendMessage(businessNumber, data);
}

async function SendMessage(businessNumber, data) {
  try {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v21.0/${businessNumber}/messages`,
      headers: {
        Authorization: `Bearer ${GRAPH_API_TOKEN}`,
      },
      data: data,
    });
  } catch(error) {
    console.log(error);
  }
}

async function RetrieveQueryData(filters, table, sortCol, sortDir, limit) {
  // Return a promise that resolves when getDatesByFilter completes
  return new Promise((resolve, reject) => {
    db.getDatesByFilter(filters, table, sortCol, sortDir, limit, (err, fechas) => {
      if (err) {
        // Reject the promise if there's an error
        resolve();
      }
      // Resolve the promise with the 'fechas' data
      resolve(fechas);
    });
  });
}

function getDia(date) {
  switch(date.getDay()) {
    case 0:
      return "domingo";
    case 1:
      return "lunes";
    case 2:
      return "martes";
    case 3:
      return "miércoles";
    case 4:
      return "jueves";
    case 5:
      return "viernes";
    case 6:
      return "sábado";
    default:
      console.log("No se pudo obtener el día de la semana");
      return;
  }
}

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

app.get("/webhooks", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT, err => {
  if (err) {
    return console.error(err);
  }
  return console.log(`Server is listening on port: ${PORT}`);
});

