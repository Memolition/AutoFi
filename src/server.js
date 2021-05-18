const fs = require('fs');
const path = require('path');
const winston = require('winston');
const express = require('express');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const csv = require('fast-csv');


//Setup winston logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

//Setup express
const port = 3000;
const app = express();

//Setup Mongo DB
const mongoServer = new MongoMemoryServer();

//Setup file processing
const upload = multer({ dest: 'tmp/' });

const columnsMap = [
  {
    name: "UUID",
    field: "uuid",
  },
  {
    name: "VIN",
    field: "vin",
  },
  {
    name: "Make",
    field: "make",
  },
  {
    name: "Model",
    field: "model",
  },
  {
    name: "Mileage",
    field: "mileage",
  },
  {
    name: "Year",
    field: "year",
  },
  {
    name: "Price",
    field: "price",
  },
  {
    name: "Zip Code",
    field: "zip_code",
  },
  {
    name: "Create Date",
    field: "create_date",
  },
  {
    name: "Update Date",
    field: "update_date",
  }
];

const castDateFields = [
  "create_date",
  "update_date"
];

const castMoneyFields = [
  "price"
]

const parseFile = (rows, provider) => {
  let vehicles = [];

  if(!!rows && rows.length > 0) {
    vehicles = rows.map((row, rowIndex) => {
      const rowColumns = Object.keys(row);
      let vehicle = {
        provider
      };
      
      columnsMap.map( columnDefinition => {
        const columnValid = rowColumns.find( rowColumn => rowColumn.toLowerCase() === columnDefinition.name.toLowerCase());
      
        //Cast cell value based on predefined columns map
        const rawValue = row[columnValid];
        let value = rawValue;

        //Verify column is date
        if(castDateFields.includes(columnDefinition.field)) {
          try {
            const date = new Date(rawValue);

            if(!Object.prototype.toString.call(date) === "[object Date]" || isNaN(date.getTime())) {
              throw new Error('Invalid date');
            }

            value = date;
          } catch (e) {
            logger.error(`Unable to convert date at row ${ rowIndex }`)
          }
        }

        //Verify column is money
        if(castMoneyFields.includes(columnDefinition.field)) {
          value = Number(rawValue.replace(/[^0-9.-]+/g,""));
        }

        vehicle[columnDefinition.field] = !!columnValid ? value : null;
      });

      return vehicle;
    }).filter( vehicle => Object.keys(vehicle).length > 0 );
  } else {
    logger.error('No rows received');
  }

  return vehicles;
}

mongoServer.getUri().then((mongoUri) => {
  if(!!mongoUri) {
    const mongoClient = new MongoClient(mongoUri);
    logger.debug('Got mongo uri from Mongo Memory Server');

    try {
      mongoClient.connect().then((client) => {
        //Set database
        const db = client.db("autofi");
        const vehiclesCollection = db.collection('vehicles');

        app.get('/import', (req, res) => {
          res.sendFile(path.join(__dirname, 'import.html'));
        });

        app.post('/import', upload.single('csv'), (req, res) => {
          if(!!req.file && !!req.body.provider && req.body.provider.length > 0) {
            logger.info('Received file', req.file.originalname);
            logger.debug('Renamed to', req.file.filename);
            logger.debug('Reading file', req.file.path);

            let fileContent = [];
            fs.createReadStream(req.file.path)
            .pipe(csv.parse({ headers: true }))
            .on("data", (row) => {
              fileContent.push(row);
            })
            .on("end", () => {
              logger.info(`Finished reading CSV file, got ${fileContent.length} rows`);
              logger.debug(`Deleting tmp file`);
              fs.unlinkSync(req.file.path);
              logger.debug(`Deleted tmp file`);

              logger.info('Processing file content');
              const vehicles = parseFile(fileContent, req.body.provider);
              logger.info('Done processing file content');
              if(!!vehicles && vehicles.length > 0) {
                try {
                  logger.debug('Persisting vehicles to db');
                  vehiclesCollection.insertMany(vehicles);
                  logger.debug('Done persisting vehicles to db');
                  res.sendStatus(200);
                } catch(e) {
                  logger.error('Unable to store vehicles into db');
                }
              } else {
                logger.error('No vehicles available to persisto into db');
              }
            });
          } else {
            res.sendStatus(400);
          }
        });

        app.get('/vehicles', (req, res) => {
          const queryLimit = !!req.query && !!req.query.limit && !isNaN(parseInt(req.query.limit)) ? parseInt(req.query.limit) : false;
          const limit = !!queryLimit && queryLimit <= 200 ? queryLimit : 50;

          logger.debug(`Fetching vehicles, limit ${limit}`);

          vehiclesCollection.find({})
          .limit(limit)
          .toArray((e, data) => {
            logger.debug(`Sending vehicles response with ${data.length} records`);
            res.json(data);
          });
        })

        app.listen(port, () => {
          console.info(`Express listening on :${port}`);
        });
      }, (e) => {
        throw new Error('Mongo Client unable to connect', e);
      });
    } catch(e) {
      logger.error('Unable to connect to mongo');
    }
  }
});