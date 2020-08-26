const express = require("express");
const sendMail = require("./twitterweek");

var app = express();

app.get("/", function (req, res) {
  if (req.query.secret !== process.env.SECRET) {
    res.status(401);
    res.send("Unauthorized");
    return;
  }

  sendMail((err) => {
    if (err) {
      res.status(500);
      res.send("failure when sending the mail");
    }

    res.send("email sent!");
  });
});

app.listen(process.env.PORT, () => {
  console.log(`Example app listening at http://localhost:${process.env.PORT}`);
});
