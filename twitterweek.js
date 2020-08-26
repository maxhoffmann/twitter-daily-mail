"use strict";
const _ = require("lodash");
const fs = require("fs-extra");
const nodemailer = require("nodemailer");
const request = require("request");

const { TWITTER, FROM, TO } = require("./config.json");
const last = require("./last.json");

const tweetWindow = {
  count: 200,
  tweet_mode: "extended",
};
if (last.id) {
  tweetWindow.since_id = last.id;
}
const REGEX_YOUTUBE = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/;

request.get(
  {
    url: TWITTER.URL_TIMELINE,
    oauth: {
      consumer_key: TWITTER.CONSUMER_KEY,
      consumer_secret: TWITTER.CONSUMER_SECRET,
      token: TWITTER.ACCESS_TOKEN,
      token_secret: TWITTER.ACCESS_TOKEN_SECRET,
    },
    qs: tweetWindow,
    json: true,
  },
  function (error, response, body) {
    if (error) return console.error(error);
    handleResponse(body);
  }
);

function handleResponse(json) {
  const html =
    json.length > 0
      ? jsonTweetsToHTML(json)
      : "There were no new tweets in your timeline since the last email.";

  sendHTMLperMail(html);
  if (json.length > 0) {
    console.log("write json");
    fs.writeJsonSync("/home/maxhoff/twitterweek/last.json", {
      id: json[0].id_str,
    });
  }
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
  const [text, embeds] = prepareText(tweet);
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
                ${tweet.user.name}<br>
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

function prepareText(tweet) {
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
  return [fullText, embeds];
}

function sendHTMLperMail(html) {
  const transporter = nodemailer.createTransport({
    host: FROM.HOST,
    port: FROM.PORT,
    secure: false, // secure:true for port 465, secure:false for port 587
    auth: {
      user: FROM.USER,
      pass: FROM.PW,
    },
  });

  const mailOptions = {
    from: `"Today on Twitter " <${FROM.MAIL}>`,
    to: TO.MAIL,
    subject: `Today on Twitter ${new Date().toLocaleDateString("de-de", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })}`,
    html,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) return console.error(error);
    console.log("Message %s sent: %s", info.messageId, info.response);
  });
}
