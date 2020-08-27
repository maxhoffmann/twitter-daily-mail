"use strict";
const _ = require("lodash");
const request = require("request");
const sendgridMail = require("@sendgrid/mail");
const redis = require("redis");

const {
  URL_TIMELINE,
  CONSUMER_KEY,
  CONSUMER_SECRET,
  ACCESS_TOKEN,
  ACCESS_TOKEN_SECRET,
  FROM_ADDRESS,
  TO_ADDRESS,
  REDIS_URL,
  REDIS_PW,
} = process.env;

const db = redis.createClient({
  url: REDIS_URL,
  password: REDIS_PW,
});
db.on("error", console.error);

sendgridMail.setApiKey(process.env.SENDGRID_API_KEY);

const REGEX_YOUTUBE = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/;

module.exports = function sendMail(req, res) {
  return retrieve("last")
    .then(
      (lastId) =>
        new Promise((resolve, reject) => {
          request.get(
            {
              url: URL_TIMELINE,
              oauth: {
                consumer_key: CONSUMER_KEY,
                consumer_secret: CONSUMER_SECRET,
                token: ACCESS_TOKEN,
                token_secret: ACCESS_TOKEN_SECRET,
              },
              qs: {
                count: 200,
                tweet_mode: "extended",
                since_id: (console.log(lastId), lastId) || "",
              },
              json: true,
            },
            function (error, response, body) {
              if (error) {
                console.error(error);
                reject(error);
              }
              resolve(body);
            }
          );
        })
    )
    .then(handleResponse)
    .then(() => {
      res.send("email sent!");
    })
    .catch((error) => {
      res.status(500);
      res.send(`error: ${error.message}`);
    });
};

function handleResponse(response) {
  console.log(response);
  if (response.length < 1) {
    return sendHTMLperMail(
      "There were no new tweets in your timeline since the last email."
    );
  }

  const html = jsonTweetsToHTML(response);

  return sendHTMLperMail(html)
    .then(
      () => {
        console.log("Message sent");
        return save("last", response[0].id_str);
      },
      (error) => {
        if (error.response) {
          console.error(error.response.body);
        }
      }
    )
    .then(() => {
      console.log("wrote last id");
    });
}

function sendHTMLperMail(html) {
  const msg = {
    to: TO_ADDRESS,
    from: `"Today on Twitter " <${FROM_ADDRESS}>`,
    subject: `Today on Twitter ${new Date().toLocaleDateString("de-de", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })}`,
    html,
  };
  return sendgridMail.send(msg);
}

function jsonTweetsToHTML(jsonTweets) {
  try {
    return `
            <p>✨ ${jsonTweets.length} new tweet${
      jsonTweets.length === 1 ? "" : "s"
    }</p>
            ${jsonTweets.reduce(
              (html, tweet) => `
                    ${html}
                    ${
                      _.get(tweet, "retweeted_status", "")
                        ? `<p style="font-weight: bold; font-size: 0.8em">🔁 ${
                            tweet.user.name
                          } retweeted</p>${renderTweet(tweet.retweeted_status)}`
                        : renderTweet(tweet)
                    }
                `,
              ""
            )}
        `;
  } catch (error) {
    return `There was an error parsing twitter’s json response: ${error.message}`;
  }
}

function renderTweet(tweet, renderBorder = true) {
  const [text, embeds] = formatText(tweet);
  return `
        <div style="max-width: 100%; word-wrap: break-word; hyphens: auto;
             ${
               renderBorder
                 ? `padding-bottom: 30px; border-bottom: 2px solid #ccd6dd; margin-bottom: 30px;`
                 : ""
             }">
            <img
                src="${tweet.user.profile_image_url_https}"
                style="clear: left; float: left; margin-right: 10px;">
            <h4 style="margin: 0;">
                <a style="color: inherit; text-decoration: none;" href="https://twitter.com/${
                  tweet.user.screen_name
                }/status/${tweet.id_str}">${tweet.user.name}</a><br>
                <small style="color: grey">@${tweet.user.screen_name}</small>
            </h4>
            <div style="clear: left; margin-top: 20px;">
                ${text}
                ${embeds.reduce((html, embed) => {
                  if (embed.type === "youtube") {
                    return `${html}
                        <a href="${embed.url}" style="display:block; margin-top: 20px;">
                            <img
                                src="https://img.youtube.com/vi/${embed.id}/mqdefault.jpg"
                                style="display: block; max-width: 100%; margin-left: auto; margin-right: auto;">
                        </a>`;
                  }
                  return html;
                }, "")}
                ${_.get(tweet, "extended_entities.media", [])
                  .map(
                    (media) =>
                      `<a href="${media.media_url_https}" style="display:block; margin-top: 20px;">
                        <img
                            src="${media.media_url_https}"
                            style="display: block; max-width: 100%; margin-left: auto; margin-right: auto;">
                    </a>`
                  )
                  .join("")}
                ${
                  _.get(tweet, "quoted_status", "") &&
                  `<div style="padding: 10px; margin-top: 20px; margin-left: 10px; border: 1px solid #ccd6dd; border-radius: 3px;">
                        ${renderTweet(tweet.quoted_status, false)}
                    </div>`
                }
            </div>
        </div>`;
}

function formatText(tweet) {
  const embeds = [];
  let fullText = tweet.full_text || tweet.text || "";

  if (tweet.entities.user_mentions) {
    tweet.entities.user_mentions.forEach(
      (mention) =>
        (fullText = fullText.replace(
          `@${mention.screen_name}`,
          `<a href="https://twitter.com/${mention.screen_name}" style="text-decoration: none">@${mention.screen_name}</a>`
        ))
    );
  }

  if (tweet.entities.urls) {
    tweet.entities.urls.forEach((url) => {
      if (REGEX_YOUTUBE.test(url.expanded_url)) {
        embeds.push({
          type: "youtube",
          id: REGEX_YOUTUBE.exec(url.expanded_url)[5],
          url: url.expanded_url,
        });
      }
      fullText = fullText.replace(
        url.url,
        `<a href="${url.expanded_url}">${url.display_url}</a>`
      );
    });
  }

  if (tweet.entities.media) {
    tweet.entities.media.forEach(
      (media) => (fullText = fullText.replace(media.url, ""))
    );
  }

  fullText = fullText.replace(/\n/g, "<br>");

  return [fullText, embeds];
}

function save(key, value) {
  return new Promise((resolve, reject) => {
    db.set(key, value, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function retrieve(key) {
  return new Promise((resolve, reject) => {
    db.get(key, (err, value) => {
      if (err) {
        return reject(err);
      }
      resolve(value);
    });
  });
}
