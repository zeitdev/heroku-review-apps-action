# Create Heroku Review Apps Action


## Inputs

### app

**Required** Name of app to create / update

### env_from
**Required** Name of app to copy envs from


### pipeline
**Required** Name of pipeline to create app in
    
### heroku_api_token
**Required** Heroku API Token
    
### app_json 
Path to app.json, default: app.json
#### default: `app.json`

### stage
Stage to put app in to
#### default: `staging`

### pr_number
Number of associated PR, if set, will be set as ENV HEROKU_PR_NUMBER

## Outputs

## Example usage

