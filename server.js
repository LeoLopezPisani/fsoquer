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
var dateFormats = {
  weekday: "long", 
  day: "numeric", 
  month: "long"
};
const jokesArr = ["¿Sabés qué es un terapeuta?\n\n\n1024 gigapeutas.",
  "¿Qué pasa cuando se tiende a infinito?\n\n\n¡Se seca!",
  "¿Por qué un fotón no puede hacer una pizza?\n\n\nPorque no tiene masa.",
  "Me sacaron del grupo de WhatsApp de paracaidismo. Se ve que no caía bien.",
  "¿Qué le dice un jardinero a otro?\n\n\nSeamos felices mientras podamos.",
  "¿Qué pasa si tiras un libro al agua?\n\n\nSe moja.",
  "-Soy un tipo saludable.\n\n +¿Te gusta comer bien?\n\n -No, pero siempre me saludan.",
  "¿Cuál es el último animal que se subió al Arca de Noé?\n\n\nEl delfín"
];

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

  if (type === "text") {
    const numStr = message?.from.toString();
    let numFiltered = numStr.replace("9", "");
    var msg = message?.text.body;

    //TO DO: Manejar los envíos de textos que no sean el envío inicial.
    switch(lastTypeSent) {
      case "like":
        if (msg.toLowerCase().includes("hola")) {
          console.log("sending Bienvenida to " + numFiltered);
          SendBienvenida(+numFiltered, business_phone_number_id);
          break;
        };

        if(msg.length < 3) {
          var txt = "Ingresá una palabra clave con al menos 3 caracteres.\nSino es difícil para mí ser precis@ con la búsqueda."
          SendTextMessage(txt, +numFiltered, business_phone_number_id).then(() => {
            // txt = "¿Querés agregar algún otro filtro? Sino elegí Continuar";
            // var opt = ["211","212","214","216","217"];
            // SendListMessage(txt, opt, +numFiltered, business_phone_number_id, "templates");
            // lastTypeSent = "list";
            // lastBodySent = txt;
            // lastOptionsSent = opt;
          });
          break;
        }

        var f = [];
        var col = eliminarAcentos(lastOptionsSent);
        var val = normalizarQueryValue(message?.text.body);
        if(col == "Horario") {
          col = "inicio";
          val = val.length == 1 ? `0${val}` : val
        };

        var obj = {
          column: col.toLowerCase(),
          operator: lastTypeSent.toUpperCase(),
          value: `%${val}%`
        }

        if (obj.column == "inicio") {
          var i = globalFilter.findIndex(f => f.column == obj.column);
          var p = new Promise((resolve) => {
            if(i > -1) {
              SendTextMessage("Ya elegiste una opción para esta categoría, será reemplazada por tu nueva elección", +numFiltered, business_phone_number_id).then(() => {
                globalFilter.splice(i, 1);
                resolve();
              });
            } else {
              resolve();
            }
          });

          p.then(() => {
            globalFilter.push(obj);
            txt = "¿Querés agregar algún otro filtro? Sino elegí Continuar";
            var opt = ["211","212","214","216","217"];
            SendListMessage(txt, opt, +numFiltered, business_phone_number_id, "templates");
            lastTypeSent = "list";
            lastBodySent = txt;
            lastOptionsSent = opt;
          })
          break;
        }

        f.push(obj);

        RetrieveQueryData(f, "oferta_academica", "nid", "ASC", null, null, "nid", `nid${"," + obj.column}`).then((result) => {
          console.log(result);
          optionsArray = result;

          if (result && result.length > 0) {
            if (obj.column == "materia") {
              var txt = `*Si encontrás la materia que estás buscando, escribime con el código que está al lado del nombre*.\n\nTe paso las opciones que encontré con esa palabra clave:\n`
              optionsArray.forEach(m => {
                txt += `- ${m.nid} -> ${m.materia}\n`;
              });
              SendTextMessage(txt, +numFiltered, business_phone_number_id).then(() => {
                lastTypeSent = "filter";
              });
            }
            else if (obj.column == "catedra") {
              var opt = optionsArray.splice(0, 9);
              const arr = [];
              opt.forEach(o => arr.push(o.nid));
              
              SendListMessage("Si encontrás la cátedra que estás buscando ¡Seleccionala!\nSino respondé con *Ninguna de estas* y voy a intentar mostrarte más opciones", arr, +numFiltered, business_phone_number_id, "oferta_academica", "nid").then(() => {
                lastTypeSent = "filter";
              });
            }
          } 
          else {
            var txt = "No encontré opciones con esa palabra clave.";
            SendTextMessage(txt, +numFiltered, business_phone_number_id).then(() => {
              txt = "¿Querés agregar algún otro filtro? Sino elegí Continuar";
              var opt = ["211","212","214","216","217"];
              SendListMessage(txt, opt, +numFiltered, business_phone_number_id, "templates");
              lastTypeSent = "list";
              lastBodySent = txt;
              lastOptionsSent = opt;
            });
          }
        });
        break;
      case "filter":
        if (msg.toLowerCase().includes("hola")) {
          console.log("sending Bienvenida to " + numFiltered);
          SendBienvenida(+numFiltered, business_phone_number_id);
          break;
        };

        var i = globalFilter.findIndex(f => f.column == "nid");
        var p = new Promise((resolve) => {
          if(i > -1) {
            SendTextMessage("Ya elegiste una opción para esta categoría, será reemplazada por tu nueva elección", +numFiltered, business_phone_number_id).then(() => {
              globalFilter.splice(i, 1);
              resolve();
            });
          } else {
            resolve();
          }
        });

        p.then(() => {
          var obj = {
            column: "nid",
            operator: "=",
            value: message?.text.body
          }

          globalFilter.push(obj);
          txt = "¿Querés agregar algún otro filtro? Sino elegí Continuar";
          var opt = ["211","212","214","216","217"];
          SendListMessage(txt, opt, +numFiltered, business_phone_number_id, "templates");
          lastTypeSent = "list";
          lastBodySent = txt;
          lastOptionsSent = opt;
        });
        break;
      default:
        var txt = "";
        msg = eliminarAcentos(msg);
        if(msg.toLowerCase().includes("gracias")) {
          txt = "¡De nada! Es un placer poder ayudar a la comunidad de FSOC <3"
          var p = new Promise((resolve) => {
            SendTextMessage(txt, +numFiltered, business_phone_number_id).then(() => {
              resolve();
            });
          })
          p.then(() => {
            finishCom(+numFiltered, business_phone_number_id);
          })
          break;
        }
        else if(msg.toLowerCase().includes("quien sos") || msg.toLowerCase().includes("como te llamas")) {
          txt = "Soy Fsoquer. Un asistente virtual para la comunidad de FSOC pensado y desarrollado por Carolina Pacialeo y Leonel López Pisani para su Trabajo Integrador Final.\n\nPor fin se van a recibir :)";
          SendTextMessage(txt, +numFiltered, business_phone_number_id).then(() => {
            finishCom(+numFiltered, business_phone_number_id);
          });
          break;
        }
        else if(msg.toLowerCase().includes("chiste")) {
          var r = Math.floor(Math.random() * jokesArr.length);
          txt = jokesArr[r];
          SendTextMessage(txt, +numFiltered, business_phone_number_id).then(() => {
            finishCom(+numFiltered, business_phone_number_id);
          });
          break;
        }
        console.log("sending Bienvenida to " + numFiltered);
        SendBienvenida(+numFiltered, business_phone_number_id);
        break;
    }

    ReadMessage(business_phone_number_id, message?.id);
  }

  if (type === "interactive") {
    console.log("Processing interactive message");
    const numStr = message?.from.toString();
    let numFiltered = numStr.replace("9", "");

    let msgId = null;
    if (message.interactive.type == "list_reply") {
      msgId = message.interactive.list_reply.id;
    } else {
      msgId = message.interactive.button_reply.id;
    }

    if (lastOptionsSent == "Cátedra" && msgId != "217") {
      if(msgId == "9999") {
        //Manejo de Ninguna de estas
        if(optionsArray.length > 0) {
          var opt = optionsArray.splice(0, 9);
          const arr = [];
          opt.forEach(o => arr.push(o.nid));
              
          SendListMessage("Si encontrás la cátedra que estás buscando ¡Seleccionala!\nSino respondé con *Ninguna de estas* y voy a intentar mostrarte más opciones", arr, +numFiltered, business_phone_number_id, "oferta_academica", "nid").then(() => {
            lastTypeSent = "filter";
            lastBodySent = "catedra";
            lastOptionsSent = optionsArray;
            res.sendStatus(200);
          });
        } else {
          var txt = "No tengo más cátedras para mostrarte. ¡Recordá que podés filtrar por otras categorías!"
          SendTextMessage(txt, +numFiltered, business_phone_number_id).then(() => {
            txt = "¿Querés agregar algún otro filtro? Sino elegí Continuar";
            var opt = ["211","212","214","216","217"];
            SendListMessage(txt, opt, +numFiltered, business_phone_number_id, "templates");
            lastTypeSent = "list";
            lastBodySent = txt;
            lastOptionsSent = opt;
          });
        }
      } else {
        var i = globalFilter.findIndex(f => f.column == "catedra");
        var p = new Promise((resolve) => {
          if(i > -1) {
            SendTextMessage("Ya elegiste una opción para esta categoría, será reemplazada por tu nueva elección", +numFiltered, business_phone_number_id).then(() => {
              globalFilter.splice(i, 1);
              resolve();
            });
          } else {
            resolve();
          }
        });

        p.then(() => {
          var obj = {
            column: "catedra",
            operator: "=",
            value: message.interactive.list_reply.title
          }

          globalFilter.push(obj)

          txt = "¿Querés agregar algún otro filtro? Sino elegí Continuar";
          var opt = ["211","212","214","216","217"];
          SendListMessage(txt, opt, +numFiltered, business_phone_number_id, "templates");
          lastTypeSent = "list";
          lastBodySent = txt;
          lastOptionsSent = opt;
        })
      }
    }
    else {
      var templates = db.getAllByFilter("nid", msgId, "templates", null);
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
  
            SendListMessage(body, options, +numFiltered, business_phone_number_id, "templates");
            ReadMessage(business_phone_number_id, message?.id);
            lastTypeSent = "list";
            lastBodySent = body;
            lastOptionsSent = options;
            break;
          case "text":
            var body = formatText(template.body);

            if (msgId == "9") {
              var dayTxt = " Que tengas una linda semana :)";
              var d = new Date().toLocaleDateString("es-AR", { weekday: 'long' } );
              switch(d) {
                case "jueves":
                  dayTxt = " Ánimo, ya queda poquito para el finde :) Que tengas linda semana"
                case "viernes":
                case "sábado":
                  dayTxt = " Que tengas un buen fin de semana :)"
              };
              body += dayTxt;
            };
  
            var p = new Promise((resolve) => {
              SendTextMessage(body, +numFiltered, business_phone_number_id).then(() => {
                resolve();
              });
            });

            p.then(() => {
              if(msgId != "9") {
                finishCom(+numFiltered, business_phone_number_id);
              };
            });
            ReadMessage(business_phone_number_id, message?.id);
            lastTypeSent = "text";
            lastBodySent = body;
            lastOptionsSent = "";
            break;
          case "cta":
            var body = formatText(template.body);
  
            SendCallToActionMessage(body, template.url, +numFiltered, business_phone_number_id).then(() => {
              ReadMessage(business_phone_number_id, message?.id);
              finishCom(+numFiltered, business_phone_number_id);
            });
            break;
          case "prox":
            var limit = 1;
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

            switch(template.description) {
              case "Mesas de examen":
                limit = 2;
                break;
              case "Inscripciones a materias":
                limit = 3;
                break;
              case "Cursada":
                limit = 1;
                break;
              case "Cursos de Verano":
                limit = 2;
                break;
            }
  
            RetrieveQueryData(filters, "fechas", "fecha_inicio", "ASC", limit).then((queryData) => {
              if(queryData.length == 0) {
                text = `No tengo todavía fechas próximas de ${template.description}. ¡Podés volver a consultarme cuando quieras!`;
              } else {
                var text = `La próxima fecha importante en términos de *${template.description}* es la siguiente:\n\n`;

                let promises = queryData.map((data) => {
                  return new Promise((resolve) => {
                    var inicio = new Date(data.fecha_inicio * 1000);
                    var fin = new Date(data.fecha_fin * 1000);
            
                    var dataText = `- ${data.descripcion} -> ${inicio.toLocaleDateString("es-AR", dateFormats)} al ${fin.toLocaleDateString("es-AR", dateFormats)} de ${data.año}\n\n`;
                    text += dataText; // Concatenate each result to text
            
                    resolve(); // Resolve the promise for each item
                  });
                });
            
                // Wait for all promises to resolve before sending the message
                Promise.all(promises).then(() => {
                  SendTextMessage(text, +numFiltered, business_phone_number_id).then(() => {
                    finishCom(+numFiltered, business_phone_number_id);
                  }); // Send the message after all data is processed
                  ReadMessage(business_phone_number_id, message?.id);
                });
              }
            });
            break;
          case "filter":
            var i = globalFilter.findIndex(f => f.column == template.filter_type);
            var p = new Promise((resolve) => {
              if(i > -1) {
                SendTextMessage("Ya elegiste una opción para esta categoría, será reemplazada por tu nueva elección", +numFiltered, business_phone_number_id).then(() => {
                  globalFilter.splice(i, 1);
                  resolve();
                });
              } else {
                resolve();
              }
            });
  
            p.then(() => {
              var val = template.description;
              switch(template.description) {
                case "Mañana":
                  val = "M";
                  break;
                case "Tarde":
                  val = "T";
                  break;
                case "Noche":
                  val = "N";
                  break;
                default:
                  break;
              };
  
              var obj = {
                column: template.filter_type,
                operator: "=",
                value: val
              }
    
              globalFilter.push(obj)
  
              var body = formatText(template.body);
              if (options.length > 3) {
                SendListMessage(body, options, +numFiltered, business_phone_number_id, "templates");
              } else {
                SendButtonsMessage(body, options, +numFiltered, business_phone_number_id);
              }
            });
            break;
          case "continue_calendario":
            if (globalFilter.length == 0) {
              //TO DO: PROMESA PARA QUE EL SENDTEXT SALGA ANTES QUE EL SENDLIST
              SendTextMessage("Recordá que para poder hacer una búsqueda tenés que indicarme las condiciones que quieras que aplique", +numFiltered, business_phone_number_id).then(() => {
                //clean global filter
                globalFilter = [];
                switch(lastTypeSent) {
                  case "list":
                    SendListMessage(lastBodySent, lastOptionsSent, +numFiltered, business_phone_number_id, "templates");
                    break;
                  case "buttons":
                    SendButtonsMessage(lastBodySent,lastOptionsSent, +numFiltered, business_phone_number_id);
                    break;
                }
                ReadMessage(business_phone_number_id, message?.id);
              });
              break;
            }
            
            var text = `No pude encontrar información para la búsqueda que hiciste. ¡Podés volver a consultarme más adelante!`;
            //execute the filtering by globalFilter and send the results
            RetrieveQueryData(globalFilter, "fechas", "fecha_inicio", "ASC").then((queryData) => {
              if (queryData.length > 0) {
                text = `Encontré los siguientes resultados:\n\n`;
            
                // Use a promise to wait for all iterations to complete USAR FOR LOOP PARA PODER ROMPER EL LOOP EN EL IF DE LOS AÑOS
                let promises = queryData.map((data) => {
                  return new Promise((resolve) => {
                    var inicio = new Date(data.fecha_inicio * 1000);
                    var fin = new Date(data.fecha_fin * 1000);
            
                    var dataText = `- ${data.descripcion} -> ${inicio.toLocaleDateString("es-AR", dateFormats)} al ${fin.toLocaleDateString("es-AR", dateFormats)} de ${data.año}\n\n`;
                    text += dataText; // Concatenate each result to text
            
                    resolve(); // Resolve the promise for each item
                  });
                });
            
                // Wait for all promises to resolve before sending the message
                Promise.all(promises).then(() => {
                  SendTextMessage(text, +numFiltered, business_phone_number_id).then(() => {
                    finishCom(+numFiltered, business_phone_number_id);
                  }); // Send the message after all data is processed
                  ReadMessage(business_phone_number_id, message?.id);
                });
              } else {
                  SendTextMessage(text, +numFiltered, business_phone_number_id).then(() => {
                    finishCom(+numFiltered, business_phone_number_id);
                  }); // Send the message if no data found
                  ReadMessage(business_phone_number_id, message?.id);
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
          case "continue_oferta":
            if (globalFilter.length == 0) {
              //TO DO: PROMESA PARA QUE EL SENDTEXT SALGA ANTES QUE EL SENDLIST
              SendTextMessage("Recordá que para poder hacer una búsqueda tenés que indicarme las condiciones que quieras que aplique", +numFiltered, business_phone_number_id).then(() => {
                //clean global filter
                globalFilter = [];
                switch(lastTypeSent) {
                  case "list":
                    SendListMessage(lastBodySent, lastOptionsSent, +numFiltered, business_phone_number_id, "templates");
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
            RetrieveQueryData(globalFilter, "oferta_academica", "nid", "ASC").then((queryData) => {
              var text = `No pude encontrar información para la búsqueda que hiciste. ¡Podés volver a consultarme más adelante!`;
              if (queryData.length > 0) {
                var stringArr = [];
                text = `Encontré los siguientes resultados:\n`;
            
                // Use a promise to wait for all iterations to complete
                let promises = queryData.map((data) => {
                  return new Promise((resolve) => {
  
                    var matTxt = `\n${data.materia}:\n`
                    var comText = `- ${data.catedra} -> ${data.dia} `;
                    if (data.inicio) {
                      comText += `de ${data.inicio} a ${data.fin}`;
                    };
                    
                    comText += ` | Comisión: ${data.comision}\n`;
                    
                    if (!stringArr.includes(data.materia)) {
                      stringArr.push(data.materia);
                      text += matTxt;
                    };
  
                    text += comText;
  
                    resolve(); // Resolve the promise for each item
                  });
                });
            
                // Wait for all promises to resolve before sending the message
                Promise.all(promises).then(() => {
                  SendTextMessage(text, +numFiltered, business_phone_number_id).then(() => {
                    finishCom(+numFiltered, business_phone_number_id);
                  }); // Send the message after all data is processed
                  ReadMessage(business_phone_number_id, message?.id);
                });
              } else {
                SendTextMessage(text, +numFiltered, business_phone_number_id).then(() => {
                  finishCom(+numFiltered, business_phone_number_id);
                }); // Send the message if no data found
                ReadMessage(business_phone_number_id, message?.id);
              }
            });
            break;
          default:
            //TO DO: Cualquier tipo de mensaje que no sea el esperado deberíamos responderlo con que no se entendió y volviendo a enviar las opciones iniciales. No debería pasar igualmente.
            //SendTextMessage();
            ReadMessage(business_phone_number_id, message?.id);
            break;
        };
    }
  }

  if (type == "image") {
    console.log("Processing image message");
    const numStr = message?.from.toString();
    let numFiltered = numStr.replace("9", "");

    var body = `¡Todavía no puedo procesar imágenes! Espero no hayas puesto nada ofensivo, acordate que Terminator y Matrix son cada vez menos ficción :)`;
    SendTextMessage(body, +numFiltered, business_phone_number_id);
    ReadMessage(business_phone_number_id, message?.id);
  };

  if (type == "sticker") {
    console.log("Processing sticker message");
    const numStr = message?.from.toString();
    let numFiltered = numStr.replace("9", "");

    var body = `¡Todavía no puedo procesar stickers! Espero no hayas puesto nada ofensivo, acordate que Terminator y Matrix son cada vez menos ficción :)`;
    SendTextMessage(body, +numFiltered, business_phone_number_id);
    ReadMessage(business_phone_number_id, message?.id);
  };

  res.sendStatus(200);
});

async function SendBienvenida(num, business) {
  cleanVars();
  var txt = "¡Hola! soy Fsoquer, tu bot amig@ de sociales. ¿Con qué te puedo ayudar hoy?\n\n*Recordá que si en algún momento te trabás, podés empezar devuelta la conversación saludándome con un ¡Hola!*";
  await SendListMessage(txt, ["1", "2", "3", "4"], num, business, "templates");
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
    
      var templates = db.getAllByFilter("nid", option, "templates", null);
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
  
  
  res.then(() => {
    console.log(`About to post data ${JSON.stringify(data)}`);
    SendMessage(businessNumber, data);
  })

}

async function SendListMessage(bodyText, options, destNumber, businessNumber, table, groupby) {
  console.log("Sending List Message");

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
          var templates = db.getAllByFilter("nid", option, table, groupby)
            //console.log('Template with NId ' + option);
            templates.forEach(template => {
              console.log(`${template.id}: ${template.description ?? template.materia} | tipo: ${template?.type ?? template.comision}`);
              
              var title = "";
              if (template?.description != null) {
                title = template?.description;
              } else {
                title = lastOptionsSent == "Cátedra" ? template.catedra : template.materia;
              }

              var obj = {
                id: template.nid.toString(),
                title: title.slice(0,24)
              };
    
              data.interactive.action.sections[0].rows.push(obj);
            });
            
            innerResolve(); // Resolve the inner promise after processing the templates
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
        data.interactive.action.sections[0].rows.push(o);
      };

      data.interactive.action.sections[0].rows.sort((a, b) => {
        return a.id - b.id;
      });

      var i = data.interactive.action.sections[0].rows.findIndex(r => r.id == "123");
      if (i > -1) {
        data.interactive.action.sections[0].rows[i].description = "Solo aplica a Mesas de Examen";
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
  await SendMessage(businessNumber, data);
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
  await SendMessage(businessNumber, data);
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
    var fechas = db.getDataByFilter(filters, table, sortCol, sortDir, limit, distinct, groupby, col);
    resolve(fechas);
  });
}

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

function formatText(txt) {
  return txt.replaceAll("lbr", "\n");
}

function eliminarAcentos(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarQueryValue(str) {
  str = str.toLowerCase();
  return str.replace(/[áéíóúü]/g, "_");
}

function finishCom(num, business) {
  cleanVars();
  //Vuelvo a arrancar la conversación pero sin la bienvenida, sino preguntando si necesita algo más.
  var txt = "¿Te puedo ayudar con algo más?"
  SendListMessage(txt, ["1", "2", "3", "4", "9"], num, business, "templates");
}

function cleanVars() {
  globalFilter = [];
  lastTypeSent = "";
  lastOptionsSent = [];
  lastBodySent = "";
  optionsArray = [];
}

// accepts GET requests. You need this URL to setup webhook initially.
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

