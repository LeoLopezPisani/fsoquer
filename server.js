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
import { normalize } from "path";
import { error } from "console";

// Use createRequire to get access to CommonJS `require`
const require = createRequire(import.meta.url);

// Import the CommonJS module
const db = require('./db.cjs');

const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN } = process.env;
const PORT = process.env.PORT || 1212;

let globalFilter = [];
let lastTypeSent = "";
let lastOptionsSent = [];
let lastBodySent = "";
let optionsArray = [];

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
    let numFiltered = numStr.replace("9", "");
    
    //TO DO: Manejar los envíos de textos que no sean el envío inicial.
    if (lastTypeSent == "") {
      console.log("sending Bienvenida to " + numFiltered);
      SendListMessage("Hola! soy Fsoquer, tu bot amigo de sociales. ¿Con qué te puedo ayudar hoy?", ["1", "2", "3", "4"], +numFiltered, business_phone_number_id);
    } 
    else if (lastTypeSent == "like") {
      var f = [];
      var col = eliminarAcentos(lastOptionsSent);
      var val = normalizarQueryValue(message?.text.body);

      if(col == "horario") {
        col = "inicio";
        val = val.length == 1 ? `0${val}` : val
      };

      var obj = {
        column: col.toLowerCase(),
        operator: lastTypeSent.toUpperCase(),
        value: `%${val}%`
      }

      f.push(obj);

      RetrieveQueryData(f, "oferta_academica", "nid", "ASC", null, null, "nid", "nid").then((result) => {
        console.log(result);
        optionsArray = result;

        var opt = optionsArray.splice(0, 9);
        const arr = [];
        opt.forEach(o => arr.push(o.nid));

        SendListMessage("Es alguna de estas? \nSi encontrás la que estás buscando, seleccionala! \nSino respondé con _Ninguna de estas_ y te voy a mostrar más opciones", arr, +numFiltered, business_phone_number_id, "oferta_academica", "nid");
      });
    }

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

    db.getAllByFilter("nid", msgId, null, null, (err, templates) => {
      if(err){
        return console.error('Error retrieving template by nid:', err.message);
      }
      console.log('Template with NId ' + msgId);

      var template = templates[0];
      const options = template.options != null ? template.options.split(',') : [];
      
      switch(template.type) {
        case "buttons":
          var body = formatText(template.body);

          SendButtonsMessage(body, options, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          lastTypeSent = "buttons";
          lastBodySent = body;
          lastOptionsSent = options;
          break;
        case "list":
          var body = formatText(template.body);

          SendListMessage(body, options, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          lastTypeSent = "list";
          lastBodySent = body;
          lastOptionsSent = options;
          break;
        case "text":
          var body = formatText(template.body);

          SendTextMessage(body, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          lastTypeSent = "text";
          lastBodySent = body;
          lastOptionsSent = "";
          break;
        case "cta":
          var body = formatText(template.body);

          SendCallToActionMessage(body, template.url, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          finishCom();
          break;
        case "prox":
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
              var fin = new Date(data.fecha_fin * 1000);
              var o = {
                  weekday: "long", 
                  day: "numeric", 
                  month: "long"
              };
  
              var text = `La próxima fecha importante en términos de ${template.description} es la siguiente: \n \n ${data.descripcion}: \n*${inicio.toLocaleDateString("es-AR", o)}* al *${fin.toLocaleDateString("es-AR", o)}*`
              // var text = `La próxima fecha importante en términos de ${template.description} es la siguiente: \n \n ${data.descripcion}: \n*${diaInicio} ${inicio.toLocaleDateString("dd/MM")}* al *${diaFin} ${fin.toLocaleDateString("dd/MM")}*`
            }

            SendTextMessage(text,+numFiltered, business_phone_number_id);
          });

          ReadMessage(business_phone_number_id, message?.id);
          finishCom();
          break;
        case "filter":
          var i = globalFilter.findIndex(f => f.column == template.filter_type);
          var p = new Promise((resolve) => {
            if(i > -1) {
              //TO DO: PROMESA PARA QUE EL SENDTEXT SALGA ANTES QUE EL SENDLIST
              SendTextMessage("Ya elegiste una opción para esta categoría, será reemplazada por tu nueva elección", +numFiltered, business_phone_number_id).then(() => {
                globalFilter.splice(i, 1);
                resolve();
              });
            }
            resolve();
          });

          p.then(() => {
            //Add object to globalFilter array
            var obj = {
              column: template.filter_type,
              operator: "=",
              value: template.description
            }
  
            globalFilter.push(obj)
            SendListMessage("¿Cómo quisieras filtrar la búsqueda? \n Podés seleccionar todas las categorías que quieras. \n \n *Cuando no quieras agregar más especificaciones a la búsqueda, seleccioná Continuar*", ["121","122","123","125"], +numFiltered, business_phone_number_id);
          });
          break;
        case "continue":
          if (globalFilter.length == 0) {
            //TO DO: PROMESA PARA QUE EL SENDTEXT SALGA ANTES QUE EL SENDLIST
            SendTextMessage("Recordá que para poder hacer una búsqueda tenés que indicarme las condiciones que quieras que aplique!", +numFiltered, business_phone_number_id).then(() => {
              //clean global filter
              globalFilter = [];
              switch(lastTypeSent) {
                case "list":
                  SendListMessage(lastBodySent, lastOptionsSent, +numFiltered, business_phone_number_id);
                  break;
                case "buttons":
                  SendButtonsMessage(lastBodySent,lastOptionsSent, +numFiltered, business_phone_number_id);
                  break;
              }
              ReadMessage(business_phone_number_id, message?.id);
            });
            break;
          }

          //execute the filtering by globalFilter and send the results
          RetrieveQueryData(globalFilter, "fechas", "fecha_inicio", "ASC").then((queryData) => {
            var text = `No puedo encontrar información para la búsqueda que hiciste. Podés volver a consultarme más adelante!`;
            if (queryData.length > 0) {
              text = `La búsqueda arrojó los siguientes resultados: \n\n`;
          
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
                finishCom();
              });
            } else {
              SendTextMessage(text, +numFiltered, business_phone_number_id); // Send the message if no data found
              //clean global filter
              globalFilter = [];
              ReadMessage(business_phone_number_id, message?.id);
              finishCom();
            }
          });
          break;
        case "like":
          var body = formatText(template.body);

          SendTextMessage(body, +numFiltered, business_phone_number_id);
          ReadMessage(business_phone_number_id, message?.id);
          lastTypeSent = "like";
          lastBodySent = body;
          lastOptionsSent = template.description;
          break;
        default:
          //TO DO: Cualquier tipo de mensaje que no sea el esperado deberíamos responderlo con que no se entendió y volviendo a enviar las opciones iniciales. No debería pasar igualmente.
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
    
      db.getAllByFilter("nid", option, null, null, (err, templates) => {
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

async function SendListMessage(bodyText, options, destNumber, businessNumber, table, groupby) {
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

  try {
    var res = new Promise((resolve, reject) => {
      // Create an array of promises from the db.getAllByFilter calls
      let promises = options.map((option, index, array) => {
        return new Promise((innerResolve, innerReject) => {
          db.getAllByFilter("nid", option, table, groupby, (err, templates) => {
            if (err) {
              return console.error('Error retrieving template by nid:', err.message);
            }
            //console.log('Template with NId ' + option);
            templates.forEach(template => {
              console.log(`${template.id}: ${template.description ?? template.materia} | tipo: ${template?.type ?? template.comision}`);
              
              var obj = {
                id: template.nid.toString(),
                title: template?.description ?? template.materia.slice(0,24)
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
      if(table != "templates") {
        var o = {
          id: "9999",
          title: "Ninguna de estas"
        }
        data.interactive.action.sections[0].rows.push();
      };
      console.log(`About to post data ${JSON.stringify(data)}`);
      SendMessage(businessNumber, data);
    });
  } 
  catch(error) {
    console.log(error)
  }

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

async function RetrieveQueryData(filters, table, sortCol, sortDir, limit, distinct, groupby, col) {
  // Return a promise that resolves when getDataByFilter completes
  return new Promise((resolve, reject) => {
    db.getDataByFilter(filters, table, sortCol, sortDir, limit, distinct, groupby, col, (err, fechas) => {
      if (err) {
        // Reject the promise if there's an error
        resolve();
      }
      // Resolve the promise with the 'fechas' data
      resolve(fechas);
    });
  });
}

// function getDia(date) {
//   switch(date.getDay()) {
//     case 0:
//       return "domingo";
//     case 1:
//       return "lunes";
//     case 2:
//       return "martes";
//     case 3:
//       return "miércoles";
//     case 4:
//       return "jueves";
//     case 5:
//       return "viernes";
//     case 6:
//       return "sábado";
//     default:
//       console.log("No se pudo obtener el día de la semana");
//       return;
//   }
// }

function formatText(txt) {
  return txt.replaceAll("lbr", "\n");
}

function eliminarAcentos(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarQueryValue(str) {
  return str.replace(/[áéíóúü]/g, "_");
}

function finishCom() {
  globalFilter = [];
  lastTypeSent = "";
  lastOptionsSent = [];
  lastBodySent = "";
  optionsArray = [];
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

