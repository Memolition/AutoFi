# AutoFi
## First run
- Clone the repo
- Install node modules
  - Yarn: `yarn install`
  - NPM: `npm install`
 - Run the server
	 - Yarn: `yarn start`
	 - NPM: `npm run start`
## API Endpoints
### `POST` /import
Receives and validates a *single* CSV file. If file is valid, vehicle information will be stored into the DB.

**Request**
```
{
	provider: String (required),
	csv: File (required)
}
```
##### Success
Returns an empty body `200` response.
##### Error
Returns an empty body `500` response.

### `GET` /import
This route returns a very basic HTML form to help send a request CSV file and provider field.

### `GET` /vehicles
This basic route returns a JSON list of vehicles in DB.
##### Query parameters
- `limit`: Integer, sets the list limit. Max items is currently limited to 200.
>Query is limited to 200, there's no current way to fetch more than that, neither are cursors implemented yet.