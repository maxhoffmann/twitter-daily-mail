# Twitter Daily Mail

Get your twitter feed as a daily email. There is no programming knowledge required to set this up.

One has to create free accounts with the services mentioned below though and copy paste the correct
passwords and tokens from the services into vercel’s web interface for environment variables.

## Required Services (all free)

- [twitter developer account](https://developer.twitter.com) for timeline access
- [redislabs.com](https://redislabs.com/) for saving the last seen tweet
- [sendgrid](https://sendgrid.com) for sending the mail
- [cron-job.org](https://cron-job.org) for setting up the repeated delivery
- [vercel](https://vercel.com) for hosting the node server which connects all the services

## Installation

1. create accounts with the services above
2. rename `.env.sample` to `.env` file
3. enter your tokens and passwords from the services to empty variables in `.env`
4. deploy to vercel (or other “serverless” function providers)
5. configure cron-job.org to send a recurring GET request to the hosted function
6. enjoy your twitter feed in your mailbox!


## License
(c) 2020 MIT Maximilian Hoffmann
