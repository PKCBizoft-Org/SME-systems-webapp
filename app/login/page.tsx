"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

const NETWORK_POINTS = [
  {
    id: "europe",
    lat: 48.8566,
    lng: 2.3522,
    name: "EUROPE • WI-FI GATEWAY",
    color: "#67e8f9",
  },
  {
    id: "philippines",
    lat: 14.5995,
    lng: 120.9842,
    name: "PHILIPPINES • CORE SERVER",
    color: "#38bdf8",
  },
  {
    id: "cloud",
    lat: 37.7749,
    lng: -122.4194,
    name: "GLOBAL • CLOUD ROUTE",
    color: "#7dd3fc",
  },
];

const NETWORK_ARCS = [
  {
    startLat: 48.8566,
    startLng: 2.3522,
    endLat: 14.5995,
    endLng: 120.9842,
    name: "Europe → Philippines",
  },
  {
    startLat: 37.7749,
    startLng: -122.4194,
    endLat: 14.5995,
    endLng: 120.9842,
    name: "Cloud → Philippines",
  },
];

const NETWORK_ROUTES = [
  {
    id: "eu-ph-route",
    name: "EUROPE → PHILIPPINES",
    points: [
      { lat: 48.8566, lng: 2.3522 },
      { lat: 45.4642, lng: 9.19 },
      { lat: 41.0082, lng: 28.9784 },
      { lat: 35.6762, lng: 51.389 },
      { lat: 25.2048, lng: 55.2708 },
      { lat: 19.076, lng: 72.8777 },
      { lat: 13.7563, lng: 100.5018 },
      { lat: 14.5995, lng: 120.9842 },
    ],
  },
  {
    id: "cloud-ph-route",
    name: "CLOUD → PHILIPPINES",
    points: [
      { lat: 37.7749, lng: -122.4194 },
      { lat: 35.6762, lng: 139.6503 },
      { lat: 25.033, lng: 121.5654 },
      { lat: 14.5995, lng: 120.9842 },
    ],
  },
];

const NETWORK_RINGS = [
  { lat: 48.8566, lng: 2.3522, color: ["#67e8f9", "rgba(103,232,249,0)"] },
  { lat: 14.5995, lng: 120.9842, color: ["#38bdf8", "rgba(56,189,248,0)"] },
  { lat: 37.7749, lng: -122.4194, color: ["#7dd3fc", "rgba(125,211,252,0)"] },
];

const GLOBE_HUD_POINTS = [
  {
    id: "europe",
    lat: 48.8566,
    lng: 2.3522,
    title: "EUROPE GATEWAY",
    subtitle: "WI-FI UPLINK",
    status: "ONLINE",
    icon: "wifi",
  },
  {
    id: "philippines",
    lat: 14.5995,
    lng: 120.9842,
    title: "PH CORE SERVER",
    subtitle: "PHILIPPINES",
    status: "ONLINE",
    icon: "server",
  },
  {
    id: "cloud",
    lat: 37.7749,
    lng: -122.4194,
    title: "CLOUD NETWORK",
    subtitle: "GLOBAL SERVICES",
    status: "ACTIVE",
    icon: "cloud",
  },
];

const PKC_LOGO =
  "data:image/webp;base64,UklGRvw1AABXRUJQVlA4WAoAAAAQAAAA3wEA3wEAQUxQSCAOAAAB8If/vznJ8f89nuecqh71TMxBMohH8cS2dWWjtb1x1rY3XMVe27FtjhF7VOd5no8/Rt3VVdWv577RETEBaK+SUsKyJx8bzr7gZ7fdndkPbtxIXnXufqM/ui6AWldKQdA/DTFhuaPHf/Lzdz3+WF6ylP3npUv4zPUf/9T40esLAEgK0t9ICQDGHnDkR/54VylcYSn9o0KSRpKl3P777x+11wEAEJL0G0JKAcDkD37v9pe43JxLKexvF21kLrcx909f3W5NAJKidH6SBMCxx33xfi6bs6oZ++1mqpq57IJbP3DkFAAhdXQh1gBs8ckr5pE0zcVYCZppNpILnzp39wggRunMRAToetvnbllKUnNhxWiaSfKZX717FwDScQlCArDJR/9FkpqNlaSVXEi+8qN9aqjFJJ2UIABrfuiGxSQbxVhlFlWSj19wNACBdEYiCcB2X5xLMisrUNNCvnXFcasDEOl8RACEc/5kpKmxKi2F5PxfbtINQKSjEQHCuifeSzIbK1VTJV+8ef9aQCcrARg29uIXyKKsYK2QvOWgQV0hdigSBPXRP3mFLIUVrRWj3XAQEGInIkCaetGrpBqr3ELyj3sD0nkkDB3/vTdJNVa9auRf9wBCZxFrSGcsJNVYBWshrzwKSNIxSMCQT91LZmNVrIWvfO8kIHYIgkEHX0wWY5VcyJc+OAahAwihHodfVKiFFbNl8sGt0RVF2hww+MzHacoK2jIb5+8GQTuXUN9owrmksqIu5KxDa90xtC9gxJxFtMLK2pS8fh8A0pYk1IaP+q0ys9I25RPHrjcM7VgAnPUYi7HqVtqMTeq1KO1GMGLtnzSYWYEX4/37oO3GNOHnd5KF1XjhgvfuNCy2EwHwyReZWZkX8p8jkaRtCLrWOJNUVuiWedsUtE3B+lNvYy6s1pWNQzcOoS2EuObds1lYuSsXPvV5xDYgCceRhRW8GX+zXoitTmLAT5ZqYSVvmbP2Qb21CbD21TRW9pnPjEVsZQH1n/2JucKjctYJCK0rYLW/kYWVfiG/Mjy1KsHwH3GJsuIvmV9DHdKKRAZNnZ6Nlb8VO3VkF6T1BKyx69MsdEArdtrY4Wi5AWP3fIZKF7RSvrDRYGkxMY7YfQYzndBKPm392FoE2GUGlW5oxlNHpNBCIjb76BwqHdEKz0YLDeg6hSx0Rcv8xFpJWoTIGn/ThtEZTXki6i0idB/wghndseTpG0NagkT52RKlQxbOGh9DCwgRF9Hoksp5eyL2OQHOZ4NOmflwPUgfC5j8H6p5BQsfmBZj34pDz2eDjtngqaj1qRQOvC0Xz7D81sGIfSgAN7DQNY1vjUffFYz7AjOds/CRaYP6ioSpn2KheyqvSFH6Rh3fWNgw/2C2A5H6RED6D5UOWmzekeiLAVv+kkoXLXzm5HpouiCTXmShk2Z+AbWmS7JjbtBLLS/ZBbHZAs41dRMWTv9OlKYKMvVqo6dm3ozUVIK13lTzFMuv7YzQTPXhPy+Zrlo4570xNI3IiCtyobM2+GPEpkHXOndQvcX0+U1rsVlqch6V7qq8rRuhOQLWeb6Yv1AbR60XpRkk7fZPKh228NWpiE2BPzLTZQu/sjlC78ngXX5n6jNUfrwr9l7EZ6h0m4shvZf2e7gUrzF7c7thobcSzmam2yofBKR3AjZ6xcxvaI2LNkPoDYmrX0Wl5xQd3zsRYxapuY4tPG0NSM9JXPMXzHRd5T3dCT0fw2Q18x1q+UCMPSZhxDVUeg9vQOixgPXfMvMeFn44hR6SuNHZVLpv5jWrpR4KGPm8Ff+x8vI7YugRCaM+bUoHzvwhYo8EjJ7P4kHGt/bu6gkJa+5PowurfifEHghY6z5TJ+J9Y0RWTYYeuMToxGXproirFodfw+JFyj+mVRPUF/iRmW4AWQWRUefQ6MZqXwlxVYAHWPyocPZ+CKswaN9XjY5cbBfElYuDf0z1pMxvxbRywF99yfjstkFWQqR7h0X05cyjkVZq2G9ZfEntrxNDWBHiOg97k3HJRKyEdL1f6c3KY5FWVAvvt+xOdvM4kRUAN1K9qXDWnisQDD/mTZo3URtbIy4HcdD7WOjOmT8fE2Q5CRdZ9iflXSuKe82n+ZPZwvWxnBhOVaVDK08bFgVAwruYferqFAAgDPsj1acerC0jMm4Gi0fRdAICELArC1268EPdQZDwbcs+pfzTBAmI6TKqTxmfgghwwHyaU9kLQxECJrxkTkW1Dw4NSQ5nplMXfntESDjLr5TXoRbX+RfVqwrvGBIxbQ6LVxm5AbAOaW5VyjRgSjG3Yub318JZbNCtlT9aG6d7VuE9OOFuFs96aMNDnvIs41On7PaIZ5H54imLjZ69+NxT6FtLLrx4CV3bllxF9azCf1ztXX+91rdIXuJd9iTNtxy8uNeA/wf8P+D/Af8P+H/A/wP+H/D/gP8H/D/g/wH/D/h/wP8D/h/w/4D/B/w/4P8B/w/4f8D/A/4f8P//3968y+jes2meZZx/M4tnKS//FdW3LvmNbxnnncXiWdTHptFca/F393UuvXiH7FnGuWds+AiLXxXeg49O961HsOEfqJ516xr4BBt+pfzJWHGtXL46CCOV5lXGpTsJptIcixtAdn7cilcpb++KCacx+9V19ZjC4X5lvGBDROy1SL1KF+2KCBz4PM2njM8BIqF+C4tPFd45VAQJ37DsU9mu3FQCAvZk8anCvRABwYSXzTzK7KWRIoDIhndTPUp5KwIAJJzN7FO/GikCIIaPqfrU0TFi2bjXPJo/GecOhiwn4ZeW/UnthskSlhPj0VR/yvzk4IjlyqA93zTzJitvbIGwPAhupHqT8sFDICuoyQeYvSnbabW0InS96y3682gErDgN+wfVlwqf3x1xJWL4FLMvZX5z9SgrEhl8+CL6sr21BwJWVob9hepJyhu2jVjpWPuJL2W+F2nlMHjqLJojme4W4ioA15v6kfKKqUFWTmTUqTRHKscgYtXvonpR4UuTE1Y5dl/lR5mfQ1w1DJ38Is2JSjlAeiBgzfuoPpT529UiVl3CWvtn86KzkXpg2TuoHlQ4e/soPSGy/rk0D8p8DyJ6VOLqM1n8p9hDWwX0UFjrg1T/yfx5Sj2EgEnzzbzH+Prx3ZCeCtN+RfWezJ9D0OMRk2jmO2av7FkPPRfCpAuL+o7yT/UgPYcavsqG65i9utdq6I0Q97mO6juLJyOiNyO2XWzmN2Yv7zdCpFdQG/5eqt8oPxMh6F3BHnNK8ZpiT3d3CXo7Dfoos9dkvg8RvS6y2e+pPqPl9qkh9B4ifq/ZZaxwvyFBmkDCfs+yeIzyVzsiohkw4pJZNH8xe33LIUGaAQjpgqL+ovxRNwRNKTJip4dYvKXYrRsjoElF0jsXqrdk/hgJTSsBt1N9RXn1sRFNLF3vedmKp5guWAvSVJDj6CrKl9aMTYUg3f9m8RPlFbtC0NQShu/+IouXFH1gRwQ0uUCOej17SeZfUEfTC4YsYPER5S+2i9J8iIM/M53FQ5T3Jgj6oAC7vZLNP6zxzGQk9EkJtbex+EeDf++O0jcQsd0NOXuH8pojQ0BfTTiNNN8ovAUQ9N3Q9ckHqZ6h+d61YkJfDtgpm3kGPzgsSp9CHQcvzOYVpvqVvRHRxxPuZsMrGvwZIOjrMX5wEYtPKC8eWYtohZtezewRmRcCglYYZOIMqj9kPlWXgNYYMW4W1RuUCw7uDtIikDB2JtUXlE8cKGihCWNnUj1B+cQh9SAtBBFjZzH7gfKxEyYlQUuN2HgG1QuUj52wFQQtNmHcLKoPKB8/YSICWm7C2JlUD1A+ecJEBLTgiLEzqdWf8qmDJyKgJSeMm8Vc9WVO330tBLTohLHTqdVe5hP7jUVAy07Y8lmaVXjK6VsioJWH4TteSLOqzjLPXXdokJYGDNrm4aXUaq6Q13ej5YvUJx3RYKnilAu/OaIWpdUt9+BnmKu3zLkfndglaIeSsPZ8qlVsxlu3WB9tM8VPnEtqlVbykq9NBELbgGC102ZRq7NCzomIgjYqNRz4H5pVY1b49ANHp4Q2W5Md72vQqjAl/zwsoR0Piye8uDRb5WV89cXjEUI7QsSXSJZqq2T91S6bIQjassSh53zrNRarrozkfwAI2njY859kqaqUdudZR4YkaN+SItY+cCar6WJ87ovrAII2L8BBV76hLFWTFea/bjsSMaLti9SGHrtYqVYlGcn7jtoEEHSEggk7fP5JUq0qssL83PdrgAg6RAEm7HTZy2S2SqiQL76xdYpR0DmGiNC98w+fI9UqHyVfvGbPHeroNIOgC9O+9QKZrcoxJfNNJw3pBqTTAAQR2Om7r5BqVY0paf8+fnAdiOhEBUh12eGrL5NarIIpSs7+/geGAICgc03Aht9+naRaxaJKvnbRUUhBBJ2tJGD3d9xVSC1WmZiSvP8du2NwQCcsEZh2xC/nk9RShRQ1slx7XA0I6JRDrGPo+FPveou0XKoNUyU5+5xdpkBiQCctAmy2/Y9nkyxqVk2YqZJ8+rw9t68DSdBpSwCGT9vhe9NJUrVUDaaZJF/69SnrDQYQBZ24CIBBe+5x1fxFJE2LWUVgqkZy0YLL994AAKIIOnUJIQIjx4/+7NXzuKyqmvXrTDUXkpx/8ydGjR8FhCiCDl8iAMEa2136wLzMZbWhpfS/SimNzOXO+8/F262FZaOgXxhCQADGbN419dRf/XFB4YpVrT9kqsYV53/96vgDu4aOBEIKIaD/KJAAAAKsPvrdp1/64ONLlyj70bZ0ycMP3nL66RNHYflB0A8NQQJSwnI3vOi8e/Ovrp5L6+8Y51591czXz71gFyw3pJREAtooVlA4ILYnAACwygCdASrgAeABPmEwlEekIyajpXRIwNAMCWVu//O9Sf/qSdeRr/h/7hhIVJNOwbYXOnPO98vsVVH5U9aF194W+R72A9lpPnaT/T9Wv7M+zjzAv4f/Nf1w/xPZ58wv7Sfth71/pS/yHqAfzv/jf//sL/269gn9pfTZ/cT4SP7L/yf2k9p//8+wB/9/UA/+3W/9eP7x+Pf7MeUv9e/sH7NeJb2QPY791tAx9sPy39y/dH2o72+AF+Ifz//OfmR6G+zm2j/Rf6H1Avb/6R/tuM769ewB/K/67/vfJg8EX8L/kf95/kvgD/lf9a/4v9z/HP6Vv5j/m/3z/OfvL7WfzH/G/8j/IflT9gf8g/o/+0/un73f6X/////7hPYf+zPsO/qt9/I3uD67cggBmmt9B5yH/WaLH01f9xzpcL02K5Kqj0sl3lEqb8zX1gyBTGf3dB0Ps2s1cNYcSR1I7p8ykyCXwNHznVG5cnZ+Hw12cuO/jIHxG6Hp7s5IO+eB0LYzsP6KM+JXUeZpNAJixnkeb4r9WH/qqWhp7stJ+i+JGKgLFvaNgTiB8UPThRL71SbajfeoQuglkVCYM0blJ5DQz/4P+WzF+623nXqddl2OwQ9BCu3LKtvwFOBBvxFfwvVkejnV80Lf/wv//m0l/ov3Tfi/ouFboFnzaWOtGLydeys6u+lKOe99iGjGwHfsr9N///8Sb2xgYrBBuELbS0eGjO8P6LtZCICvaaumoPP0M9XSv///lkAQ/+tzBkSW81jkBLfxBD/LhmG/TPqou7qFygxFPIBFBs3FirdLD6BDXki8TR+V1Q/2tcEHXeUWkiKBl9tY9GLSnUg1uPVbpIBXxWAkkYAwJ8TGJjDte4Tx3oxHoVZtuflJptSRLPQHDTni1mC/8/7+8Pi/7VSnbZcyiF/Tc/T6hkzSRtXJwqlmbavGgOjzR1RobSB3//lDDMGFP////v3WjN8ujFcdzLx6t+KKgjzkoyyW8NNtHd9NpslJmO8otJEzwJQKg225aR7wl2oyfnVbPte262EZTyNo908mEXJ3h8mN3xXsjGai2zMb1trFQ4jiFe8rctybEPK7tdF+9IU+C9uG4eVT9p0RbDH4xFfXoENe9v2waZWrIXscpYN5kkN4ARu9YMhmBXDxRwUkHdXmMKNHDF/qSjQnlEyOK3BNcavZf7RM614hEHwVRNyFtrRhO8H/8auyrMm+yikA6QDjBhL5g0isSt1syfQhY9Rzu0CB92x5JG7ZmlY0K1i7L2Q03ecTOiD22LxTm1iWvtR7Cl4Xe8ODXehMTw8xZvuv8xvqqonXtP0glHwwWs5y6DVFpIjGjzdEGlyfCoRj81pxkuCteaTfWRn8o9NOe4uBwuJCrh4FxJuPX2LdZx2IKFarnTAeIoCgxhCfeaduvUkQhgZcrF5YUVqitdJbOmaxoN+mJnSvDuetMnWtGcJ2XnlGYJNXxIGh75URCZXj2a37GUV/7gH8Tm4Tx1MZx/iGaSE1E9vJzS+eLclL7c2syvAXJC7ax2jMNZgOSPzmUN4coZ3oJG6FPr29QWa6O+D+thmGxSxZeF7f85Flbty1WMXwl+t09znWKbPoi7THybzJ1KCwMxjx/rYkSUVmZmgpNLBBVQ5RxulfiaVg4lG+d1znN8ErjmYxLd7YYYN3Ve0B/9p3tfLCAGWFRDgaLsXrBuBOBp0Poo0U1X+rarskrihbPyQoBM5Ntle7gn///nzaH73sHNXlwVM0jzAVf1R16nGgj7aPwsaDdMLLvwOHpwAhl3ktVEE3X3L4jBjq/l/zag09hGUUT6xBQE5TObF2X8prHaL9sPAw1MEn9JO0kQWyFNllI/W8mXt64ChDKI6cM3Dox2sCliDXsTuYRPPVLUYqldq/ToqJx7N21l9T/9fYi2FXZk02LZce6YqF9jjHlXI5Wx80x9aMaRPOqN+ibHmQvIUgj384ptP0nHIj4qbaRQ9wX2Bl5L+7f//KTUhpsB3XZCNSRQsE5R4ArrvlqoE7tfjGBoNAx5Iti8vevKT9g7rcOBKWLVj7064uD3xcRbeku0LI6DfPON6qSSx2ohsc92vFv+hiBWy/i7y5umg+pKbmTGsNVTPcn5foU2+IEW0aK5MdM8C52jAuT/u4zVI6EWx0Nsho+0iOTmRjLcrxL1DnM/86EaaoAP78+EAEHfB4Jeefjlc+ehRQNwrNg/33+U/QMsdLmeBrXs1+AsHFinR6cImTMml3aS99rsKqthTDpjIOBlmM4rEu98cM8eshNQTI/7YxnPblERqB7Llurw/iolN7XO4U94/phjrTeGyds0y1/jIERnmMNbzsEx1YgTuPqpNmMaQGhnZydT/WvAP2t+bCKXaXg5xaSMlUVRjQld6a8HdqeLIMyV+MPZZmcENtFBKI7/yY5KHUsEoPdUG6odoMDkziFBKkumV456k458h6ROvZgV0iL5PrcoWu/H1AVkQgV3LzKqBRQa2us5KIYZIV4dLrAGRg9qMgKwuWMPSzWQMuiSGF0eU7zVvLedD3bnDd4zf9ANh15UX/02It92CycdxgWfCLjAV3xAnnpw4qjDoKe2HW8MY+dX3BVD0KlO0/fLQQtE9DMWqxEo4qc1joKOjNlEJar6SZDYccN0l5acVR3/N9A7a9exoI820PYiwnUZ15/Wy248OnnOXaFqpAUu2rPh/uS+dw9uK7BjUNJAb9cAz65fm1b4Uotmhtan38LRSFnaukgR8tQ7vOhWBjk7Qb2j/ftCxRU/yenYA2uTXxeQ9ipJ5uQJW+i8Jwj/lg0+OlxnNt+oipPVlpiFiQf/F/eiHboNBcUeHw1fA9o+fBDbvOE9efZlIaB7wDvmnzD2N6VbwS9lvm2s4ABO9aYqp8dN0uphpeGBieAvPqBXHrvhPEs1AL4D2yQCxORl2lmH7bP059ML+6mXAXHfEwTEnWUSwyz93TlmIqEG9LZYem1dUUlhzr41Ye4teTOqXhh2vgKZcMLfpg4aFocgWdXUOWIedoMMYmHFSjewcVFZ6m5vWRCDGyuk+On9qV/4MCj8xdO27lC/j0Ls2E2mWDFkfZl2WZsUZK6xZhJSvHBiy7pTk8EZ4AtF+LQKRvc2BUO9Zn70bPms3x3fnyXXSIwYIMDRoPT57j4dt8GqjC/658fFeD/PMV2oK1kv7RROp1AveFjLVTPc1jpwlifEm7yP5HyVMqI5p4rSZastIKVNQM4JeRQ6Omh8zC77dLyP5OKATDMZwUf5Ne5S3boRzOB6RiVycpI4X4eryhPsIBp/5SbjRn8ee8QwS8uLYy/fuG+dTguIf8Cmeeqzv+b5LKeoPPEUlTg6+/1rKjh7/84htgQuftnx6SeiVjVasfnVO+NKSNHs8mJwLZM56gQ94ntDz0JKVRH/fpsTGp0AqW3dwM8skDsFebzVLFJZf+TuTxwC4rvbex7hKFDC3AyMYt7o228/d46Goakf4QlrL4MXDfDEU6hSMZf5BVlAmFV66dHpQuznYoQLRdPgiqU2f7ipUIhk1lU7mVo5rC0pqElpq1NKyQ92zSWfAftn44kIxALMffATdLBteHhhBVcvsDHpsvyqOWga5p+Mn9pTzDA6wGBLwoucgCkzvqdb8BrbXtH3d9YsweXv+V0tJ0vG6FYO/u5aR5hDtmFGaecIoLe/Keh0bBj8rkvbwvOvYanJd3uKaN5JSsw0BU2e6BOK7qbSztPmNmDhrBbUmX05cqSuBGkzxnlzro714uH1XoQdBi9VrP9dYZsBjbMDT9a+P/FN+PwNBVulGoV0MpIy6B7gsG9RlusyL+dr4Eq9esKG7DGeb8lMhr0kxhRZLsCKZJQ16bc5zg0L8plqtmg2BH+213EJ6fxM6mXXMd8c8umFg/XgZzslj3GxXI6MnL03Ifpc15cVuIIEvOaEHkgO//9TOe/gVrnqr4fNlq9CRZOPdsDt1gAqqE5pwT2IxOOKQlTdCqmElr0ak9qWPKmQmoWVjwpW+JiKV3Pxid+GRXkntWj7oG0E3YeabjvfQzAAPQdtuAKjCM/IOz+bdexkMeda710Kf0bw7xeIIpK0G0tuc41vlvBhs3Ej6H5U5kjwCxoD5QpyxJFO67A2a26Q40H1qlYjms/ICZr1YG9oSHVpklTVA3Jblr3e1oe7Cm6jYrD4kFlqYzqN7jHPU48o537OpGVux9MBNfJKKaOifAu+8MNV1/OzzPc10Ym98+sz8+5Qg4ChZRAKp8HbFRq3hLfA5srF2fnrUy5eiSiYnhf4I3gd1kfdsnPXUnCpqhHkKrQUvYRlQjXFwiuOQZ9s6Wk9fk5b9ges3mN6sLPVf7DXYuTSPgYi71WXd3mljFtZ5H0hYbOJg9yNH4lt+7bIOsCVKmaBwkFBO0gBdONRv5fm/ZlnqgyJMIFZ93ukEx+F+SRaEZKB7fCmZ3x6Ad3qDubXyjIgB1HbAM5TJh8A7Nwo4lRdFmuINGGKa7VECuZdGLv0xU5isE49qVIIyCFSzmdNC/0jV5+v3JYHkUo/Axrz3TAePQlpMQrSlU8vs6eA5H8eiPFDgy5IEyeUDj90e/j7uH56Hy/8vqLQb5GH+wvESxxQEsidzEY1TD8lAR+869tBfjZsAgGGjRSjqysGu40ZyaClWfCAntC53RuOTN+/VMU5HdpnoTxTlocmIy8bI+jgTY9K5dryrq8HZkJsbsbjDY0A0yGxupUiEoqHTDdQWBNSjmCJjM6gEXds3reYUrgMpr1L48dlVX2GQC44L8UEIb2zCsclW+x0X6FOHo3Aqh06TQFkXnBi1JpB0SX/Ba+q8OWIUWZKXn+/+jpkfzBOsCRfB7VUCRFcxlYCDxFeqLlSoXppCK5YS6x1U/JxxO3b4t9uig+8zIMAHJ3NGwI4VXDj+Vr5MJaomVJGAPu3Yjj+l/ax8NHLwKF2IX4nVev2KqrBQ7Gwc0NOy2lxn/uq8TPoWe8hxzKBi/m2YXhwKo1t3LRfCe2crUBkrff/0cmbgjG4IbNLBnoMAbkDgM8NfU6e0EJrBiTxf1cx2QDyT9pOQKxt1gMSVvTCMkXvmvZj1WvJX1PGPUBt06ZLCuRE4odeL8dXrHTiG/HG0k/Hf1RBmDEstjSSIqNdH7ug8sZOVzko1vFnp5p989X6YayKli4G9EdsaOpCiS9ti5mk5p2h78Vl+3eC4NMdG8mQAJ7dIrRToY+P1pSNseu9s8Ab+PAMF18qlzIAxN1glRb+8ZRfUNK4oaPuA5uSX124g1ZamqHvM3f78iR29Pf+9woidBDYUY9XUwnqtx6zf4VdD9OQobArjDCh7rfDZBN+h9m52EMu8tUGxJceG3TNP4hC4u7HSaecCXZ6NGe4rq9NANL0apK7S8d7uXnXjQVZf/xibfxiEbvwQgVJUX4yi9K0X/bHodgu1vGRj0z7iumbnCXl7Q1NyLbNpkK1TjT9plpC/1GFfObDSrSsN0Jok+WnsB50DrymbbFqTsLyhrGFqf4HIrSdbNQTFJsgdkI95oYVvuyOcooes9Lww/XGa4jd37Xw6GoHf4sct8nV7dAtQucgJlQQC9oTVppyYt7ahUEbCcWHv2hKwtQg/HLvvRAVmKxX+Yt5aQI0ecA9jPxUPGbBBSew98NgQx45Iy4qbyEfvwvUvTk59Z0Apy5K+IW5iGoT7EIabQeQ1DWwX1LKJMjCBzME2bc6/AySDUuSw/jX3X185krmominf/5bHNxw16ZKBsWX7Obd135ffbCf2883rnu1RR2PE51lEGvpPX90YjE0gL2u+DT8CdPjcsrXkjZ3CMO7yRdnZtm0ry2uaizqPf04UPI0tRt79rMVZPw6LVF27gbVu6va+h9tDmwBlK9V4xf5PRI1xC4Ng9hwJFenG7LKmDF7ztg0BaUl7QXttAzyxMq0Kn/PWFjJz838LCzxk99dFlSuUD8NudsP451aA38SYabtA0Zb+BgtHFHVUnTn/tGnWvPYWDH1CjZXtE0+T0gSQeMEddnVn6uVPigeKYGGfQB75oyCD92ZtBx/u9Yp0iWcPIS00BEmMCbhIcgiq/TxMKAOq52ROJSQBzMsYnSiM+MaUHyvYF0QkA0p9pfyMz45m8MpjFL0BlaU8q7NVr43DL+oqB72u+kH85+SZDpXZJNzyjQr8kZuVwmVpZNxdWTMoafqcA7kdzTcABUi2HcmoBNqqnO6yPDFTEC85NCUR/vfr+grtdlO2nOKtJo6LI2HDfoz4kdK3NSoLmudS+ppLbSmEwnaZ+PqlHI/kVH/x1wcv9vyX/en7esLOgX0840ArlUj+ErYGk+TzNeCY6YPEalu20f8leDZFV4zICukYeqZp3N8RFJGaTiw5+udBgRr1elgEbG448TOVnW/QlfhqUEGP0GdrY908jVHJ9Z4NyMPRIuWdH1+aOOINNoixlnDvc1EYZ+Oj8PGykhQUOPCS6Ve9S0+q7yCopguxy6+LU36dI86mCvgJWarLWU/QesT8KdA7TDtsJRduCMOWEo8WmLxWfACW13Q5Q6p3dzkHuHgmll5BAozBGcZiMxXM0vIoga3h2YGUIcx06/pKXGk74NKio9aWiRO8c08qjg4UZ1Xo3BUcDYsGMZd+FHmCNxH3pKgxqmeOAOXTibH3pdkZZ9+V3/Pya1G4lSWEB4ON0OlAp5fUUDjSeLhcdrNx1wY4KKjK1sK7kwKrCGnwOgFwoBPWDEgRE83sxlkFuJtG0DtskS8SGtGW1QAAjqRGV07ZdX5jxDNQLdkr/bsZB6wxYrf2GXPzS0m1CokWTnbO63CzAPiPdeLfzEqrgyZMcqJLlRBaMPTTO3/U8f9s2/sh5FiGg685fNkxUgjWyO500Bsj9xHBUPDciqbZQi9/aQykIN2qwYT9omy5dSNflC3FhEangRx7g4m0lrQ/ogcQC6JDVoKsa1o+ypYL3TxZceWjSd8UTtDCXPMnMDSR4I7UMBloJx1QTnPspfJappMVnHx+9oNc3PmhovAFXzpKcQWpN7E/AsN0HvRCP30Vrzabs1NJlraPFgXYEGEaTUU5jQE/ttYMfx57VjUC/cr0pm9x8OVL9FBm2Gbzy5J2Fo1eW7kBlY9SMUB34W85HP8g/L7GPgRjBQ8oeeZHUuijHCyLtAgmOgbegPKtVZzAk/XXUB7rI0NnVT5rvC7LiYO3K6//QSQA4483hpwAocc/JpKoqITJ5fYr5wmwoq6ZOa47q3+RXGRCSQHKqT3bV6rrVVozDhAjfAOtv3R9SuB1JhYldErg6PzRmiRUmRkQpdfcPMtzvVO5wlXTN4ZkViQaTc/1JD9ayjj/ZYE2o1XN8A/vsNwtKSHlhd3rb/7Z10RnWtCxdjISEURIacK1b75K5WoxRHnXxfZf545Heo1xk7qwMpQSmOrXMOe7/gCm+MRd+rPsqss76cFb4Mrs1XNTzh+haeKlRnRjMpx6IkeHqSO2ENdl+fg3Gk7LbAxccsp/X/Aglrro2FQIhIpvBcbcL4c8AiPW4Rr4aB6v1Y0vcu52IFx8WIWVWvAi+RCJmsLq01Gauu3OWB3V4B/LD900AqtpiVtbFXTMnStsF3UXjcIHLGEbqYcF8iVebVKoBKpbj4N9N5W0rZvTRjwWxGTplEkwslfzU7PXKAS9m4N0IICW5Dq6w82L8/uWg/ZgUUDnQa0p2HyaR39jowD1WXun9xrS9CAYdYFpHeTR/f3RvNnlubdMK0z89Ze7x5/92R/g013B0qaGh/bweflD4wPNbnt8N0OUBBAZAjqBlhYVBD2a3ZePzg1rbGQiSOB5ezR7sAbFLHJ0q7przNaYR7qoWs3OQadm6MI/n0TCbf0gW+9nwvPeT1+Hyb2jZA3srzS35gcErw1qipW5bwkxgjkWYDkmmlnDs895kvPSBHmPcU7qZrAHEDhGsLzsOnjZ/m14qNB0yISBAoXCAyi1x0Jm3KjK0F5UjY08XnbnMiPu1vrIPYtkFlpjsnRfmU7CvaHkxEAqy/ow/iyKgkejNzoqX+wMZ/hADi5ln0PvntScd5N5z/0/j8hBf5+awBbJY0SgjEcWrbyxgPkDAj6OydjJXepzgSgkdzg/1oSFbCWL/xUh/Qa4fAvJcNSEB4BHP39SX2nQS9Xf+qD2WJL15aOlb6lZXJfzhLX6qx/rf9RpevfWMMMftvYGR6nkkVmxm6YcB9K7IqOZQUHre4O4YvVSn0gwSqiefBP3ih7pzJXys12U9OPKmsTkpLuDvMCEHkIMQmMski2bF07Sve3gMo0TLxPcC3Myc8ANoyg54+cv4xk8ExDlv/ycUmB0NcRu6FgqcAE4WtSO4LXYjMycmb/BImXpMiq99Sx8kKcLXyTAx8Ek/6BS7dwm9WxlB/d+XHirpwj6SxjCdItIn4l+BKI7Rnkp9Oyuk81Vk/3g5As2F6+548cw/+ULZziMdVF6CK2HOh7TDf/jVO2cFUa0nnY6XOMexJvQvMHPwXzHsb8yjjFyntQrBYeVnSxN0wX2T1g3Ylrt/z2Vn+oLeCvMI2GOE4EPUpjRdf/7E82ZyDfoTvxVVw1oPFsiFaHVfvJGpxUqxeXCNMqnbuewABjRk4u8gIA7tYzjiZDV2FLrultHFVW9q3zKuth9KgVjfiUPJ5rFyIoXjoQoBjT6n80Dm6QcZ96WL48LUl/x+xTj3PO9i3kwQMe2NC/eN4Tf3MR7tlDtBqFyr9zS1soqdko4n/c+kPc/B/s6KPVkN/Gld90xWEQ+u5CNnPnyAYcD7mCi6ozW1JBveqE/u+ev5rV0hVO3Iy27jqrHZsl2NQFRwvy2OfS4iFsVnt773JNV5KGjjPRKOKuMJ/9X+WwCxBfEwmpTI6HqE3DVqhNKXFX3mehcSNr1y03gDo1tC08VHO9JicacjgybGEGemnjZYtZ9SZiIhpGf74MA53RvWK2ud5inPebP4H7apYqYmuNQAjOPrSUQM7JM4CiOu8OEtBeTQ6y9piz0fYgTVfrDUSFO8mHh7fXbVdPerAaBvlkkyY91P8HjI0NyaHD7AaOcjqgDc4PbMENLk19WIWdohvqBrq0tQsJhVjbfoYG7gzGlBj92TZkEulVirK2Py3t0KZ0olf1eNCxP+m2LvibMIGG45z+GpwAqHIXNGbqZx7h12VMlcr+8HlBTWy/MJuVioBhLSGb1GlXwP4r4OEXzlBKhWoU1uSCKzn9y2En6qT5l3Md+V/juV5HkTk2qGS05UiQ+j3RCCTbLGk59ZUJtMF7/mk5OS+S/Y4xz7zir1Y1HhwvZjp+BNv/5FZxNJWZkaH/wmkJuYYh/kkoNsyY07AIYK2ZQnEUwEqKHn4OfHUJHrSnAHc0OJIFUhRxKX8RG1naFyRRd/7e+ifIsYHZpR0YkgcTX53KHRNR7y4cHhFkI+Y49td8HzLW8gOq4M2jg/PjYAv5cPCKD1ptrwMq83c/+Ut6Yw6wLtwesiwSfyiieO3nWlIJl7g6DyOR6mfScE3lqKOJyM055bKKToLkBpRYZVF14EARArpCkKRQo8NiZ23d/UiAURGobB0CT32SFUT24T2APtr5bUW3AFPZrWBTv4eeB+aePsj98BxS4LhKQCM1TyH5jEDArLd1bZLrrkHSdLBrcXpcCFcSt6cMPKRY6qKaXrkwadSxROxCAYKFlQVmHwpKv6UXvf1+nR9bedyCqcP2FLKZ0pUz+5S0T0B9x5+YwKjotz74J6L0kayD8wTCf7kosI1RbRmVdouj2FJ59qB5Qp18qh2XJSo4xV0/6bzWl/b6NZ0Xvu+fHf2UczrgRBXNKYafcXjwnUvBl8k32BJTBowaHtIYcp6jNj82xbHAvvptxKYEhjjjJPztvVIdAoy1BZ3olLc3qAF2D2QSx3h2/vQxQcA2vgqKtL9FqKrfpacA6EVYnSkhwXCgR7KhoeWcqIkeC8w95DvjEcJmJ36S983ZaVyQlakx2/SR2i4z+Wie3gaaX2u97eM/Q4I5m/+4o47UWA6J+iuRZsxuq1xJWlAl7sCTJMya7ytIGAybpCJknX3g72thOwASV9iJo06UJu6AVLZ898CDLeVKBF08A/z+/wPosfgZZXcCfSnBU9vJQ4e+CBSJw/xCDTXJLDZyvYwO6g4+uS26CU9D0McqagEyTvkj30MHMh8a/e9bBIqXE/AVM4rnX0XnFbCDsargxf6CnDOT62E6GpytuBlos/B5tOijJ+5fMqkOrbsiOdBkJ2QtsVhRL5JTRDMDT6VhQ5IyrAyl/Wx82O4B+I+1OLACOoV32/Jsa7duD/iw5wYZa6dqYe5rkBKyBSR9s8jJ5g+ztBsGqANaBVVRi4OiEcxFrmdsatyJLEwiSL0l1rGbwaSEG2B5V9lpAVfZ61Q0d7tBCm5rmLIFqE2sUS0+yDDgxOWC0bkxzj7ew1FiJCg9oTLyHPiF28/aZGKYvTM7YD/zF9XsZHBYrUtGUz4rtFZdDHxEtZX7dwdExU2tcKLbwG6PoU0e1BZn3j7ptHihQwwzyJH3TIY24s2Ng6P18Hpv1beDqXorhbagfpwbxJmnd6toRhJ1LRwIjLRw6NOH/7jxvlPZtBlxvzTsKCh04QlPDDuzBcuERpD+JX7TX2vm/rTMuXlYsIrt3zgd7n+WrU1AiM3qcPiZJSXL5asgUz5e/4fQC8p4g7gwqkx5rIObXgQThKaeCP0NYmKo1dO9wb9GoKRCUo8WC/McJH8els3EUqgNkpDHXvEmSPVoIicucM/V24e/hY9g7dqqZ6fvJeIS3nginw/RMTfMqIkAancnp4mV7i5vuik6Ueb2DJzFHCEE0nQhwC0u+9pL0kht5ptVAJctrArvgpUBwRBNkYvphXVyFDbwCcMOxAWXGl4OZ1Ze+hZEKEUGTiOcqJXFsZ6QqAezzi9zcQ5+yVYZ2PIoO5Gj2m7jQtE68elQn+XfZC8+0Qe4d6JIVcJgn9T19po2LFjOro2QrFAde0IjjdYXRDxgpkDIkcjZL4ATZFR6iclD9ne1fUYnZhanQzuNCCu4bbRQoQh8qXnQ2vdSGl1Vxfq2ATGRh7CSYuQf5nwbGwYVomx2ky6j9dbs0CSJuzcfMOuni6CCoROV/eLRKstIGri2YUEQNht1uPes0/0il0uF95x06MYrs0APUmMmCcN+3pSxR/QcPbEYmK/3MbeEo2S6JQK0/lipsmiS45itw8qDhL1t+LB2CTNKGDX+3vpjE45srAhVmg6uQcp6Tuegabt4gYkdX4nfZtOzN7WS6EodTG0aEHU4xN4EqeG/dNxhy9cn1THrtU5ZDxarq709ngMzF8pPC8jBy1zP9+gfZddpdXfB+6Lku9lv0bSonU//SqONveJQ6xGhGqDdFuc1igNf4BvsvhRxXP0aGQFV/pM2K9LdiDQIIXZzIcJFeAFUy936DY2Ne2CqaKIMOdt2hU4JhyB7rWF1ePn2JlahPQmHygjH4TwkcFIgGWlM4TGZY7xnREHompIfXlAuRQZ4qpGF54PGER38PIyVcDaGAilT4RuX8HHej3X8AyV2eVdwYqdjYF/WzHfxP62MTe8GJ7c1iZUS4oYa7ybpTjEl0cZjhQ/UVzjP+BgU6EuZ766sE1F4ppc3tGgSH1qYs1kn74guS2/Xb0W8V2rAiN4BX3bKhfcsvhIrmn1hfgf/GGtlDKIBAbHNUhjuGrQ/KgJbX3ns+75VMGuU9fhQrQeUkDXf6foBZj4monGZowtwHfcrEz0v5HbLZRegYxugtJ68iLh+4UkcPPY4KW1TElrhb9816UidJjwQHrLijqJ9EtMignn4LFhnKhHBL/eaJOnLdg/7bKT7UWZ1s4uo0IZSEfFb3VezpPUdSPpq793cs0noZ6VPDYGEjILufuh3nrrFpPS+i0QJqN2Nqs54bUlpEDqy59XSROVLJu8+SCAXWimCHIvy8M0364wEGUBVPzcMDdWuznq2s+5gXjEGmrE6eqz3URlWS6z9Bp86xmLAbOYVeFYi9u/bQBcY5zKhXNkSxNetMWcmK072ggKwlKt2cpZZHV8DKb3tQoCykF8e7X4Tlrs3pPR4zGEVEAaTsaqZPaGfWzgPEH2tiaU0HFZQmYp9H/FJHfjiNnffqUYDfc5YmbJvnssRc6W9zzmm0ZZNLhnTBsuB9Lm16Q7yw6/QzPXZ8ugmKnKddfLIuefsAD/RYh/5FIKYpBfO1Vit4vFJ6yIjsEydq+VpR1ZZk5MdlFQb0VmvMq7JjzBbL5j1v8r+O4vCFugxJWhWwUfa39+ISOkz+RYtMO1pHpKnoG1fD76tXoKnkSTKK2PfIwxKt08dkzcABlJyz7qhuD2nlrF7HOKG7KnkU1fY4qpD57aJw6/L2mVfDQnJXqfdpew+ZUWzkCdXVR+j+ftWxSxk9TzasgqEv0ZHamNtF6ZOmhLp9kW+QS7/JYupWgMN0PorsEmDOUXcHEsn9Rgj7ktQHm/XghUpzA826QRvDU+ETW+ZchUpRC20qQgcY+CjxTtyabv4MU96Q/saZqLE41eUTah9d3Nu88ETRghHEG3iNsnpiw9JziiPugwAXEjMsW4OWr7bFHy+Sbf1ug4uKVrIr28njNV8/+rAHXgAY3wTwS4RbKS/Lj2p+gWgEaX1fPKdrZ537xavyRDFp4R7Tkm/iriqAPuNd/Ycd9n1Ic3XYVgba0yntM/XfvjPkybND+JneRfFYiY316AsjoulwAmACdIwVOPd5ptWUH9xd0stelWpD0tdrtasXWNtaRvqRFmTvCehrm55qQ7+TwPZdPbRtpHCPOgpu0ISZZ4wMtPmJiVKpUj8buLAbNZZaRPG+mutGOOKBkvpxomzsvArEmFyV6vbondA2dxhXqiGr/6lezQfzT76sJqP1cjSwoddWrpw/haMXtEyPRrFgW6zVgM5zzes6t/MaPdIrEuWejSTtBXy59jNtJXMxe7S7DPb+nRDOqsHISb+FU0lTP4BiiTb5HQAKY2A4VjT7+ti//7Qj//Z8P//s4CXhwAAAcvvLQ/kbPjfv8sRBEy+QwOz/vXdEMpzG9c6VFj+JFZD4sqQ56imkizxuwe1AHgYjjpKTHJqD5fyWGDPUx1l3Gz6I3e5UggTxdFG559KRHYAaDzf+HbWFTHZGTLCzR0WDMR7e/XAcl/QGBzftIa7lwaH6oQlFCGB39KtdG1CBTW/0fQAvKyt3uFg14qxYCSP1RPU1y1KLkeRDD+UJFYm0aGVy8mH9ijaHdPwQyDht0LuD0NCSjfvpgwyhihhNc5I858+eS8lQHY53ROLI2+jZj4BD2daAO1FeNDq08v6kwZR/QcsfmEhxtssfohXQvGoDcJbU/iJA1AWWlq73xP7No6ek3rMP2ZflSHF6JvOmp/KwG5ECT51wh+pDJn1JmN4OSrKubY0fMfJ7WWWrPJev2k2m7MSZwxDQRC7xLbbpLIaHMzZOk43cHcYF+oB0J/a21gHRjc3EYb0DR+C1LcsS1Whuvsogfr+HYUG8fj+MklOepy+leaF+EZo6ft8trHPS2KLV4bD2RXrsaD9JFhjF54d5Wu+fIeMnFplKLJ0WbddrvxJj3HVOgMjCKyqwmP1v3mkPRnWfQU4wW3SBcbDFV4X/yTYAAAAAAAA==";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [globeSize, setGlobeSize] = useState(460);
  const globeRef = useRef<any>(null);

  useEffect(() => {
    document.title = "PKC BIZOFT | Business Technology Platform";
  }, []);

  useEffect(() => {
    const updateGlobeSize = () => {
      const width = window.innerWidth;
      setGlobeSize(width <= 560 ? 285 : width <= 980 ? 360 : 460);
    };
    updateGlobeSize();
    window.addEventListener("resize", updateGlobeSize);
    return () => window.removeEventListener("resize", updateGlobeSize);
  }, []);

  const handleGlobeReady = () => {
    const globe = globeRef.current;
    if (!globe) return;

    const controls = globe.controls();
    controls.autoRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.04;

    const material = globe.globeMaterial?.();
    if (material) {
      material.color?.set("#087a9d");
      material.emissive?.set("#032f43");
      material.emissiveIntensity = 1.25;
      material.shininess = 20;
    }

    globe.pointOfView({ lat: 23, lng: 92, altitude: 1.72 }, 0);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      const friendlyMessage = error.message
        .toLowerCase()
        .includes("invalid login credentials")
        ? "The email or password is incorrect. Please try again."
        : error.message.toLowerCase().includes("email not confirmed")
          ? "Please confirm your email address before signing in."
          : "We couldn't sign you in right now. Please check your details and try again.";
      setMessage(friendlyMessage);
      setLoading(false);
      return;
    }
    window.location.href = "/clients";
  };

  return (
    <main className="page">
      <div className="background" aria-hidden="true">
        <div className="ambient ambientOne" />
        <div className="ambient ambientTwo" />
        <div className="ambient ambientThree" />
        <div className="grid" />
        <div className="vignette" />
      </div>

      <header className="header">
        <a className="brand" href="/" aria-label="PKC BIZOFT home">
          <span className="brandLogo">
            <img src={PKC_LOGO} alt="PKC BIZOFT" />
          </span>
          <span className="brandText">
            PKC <strong>BIZOFT</strong>
          </span>
        </a>

        <nav className="nav" aria-label="Primary navigation">
          <a href="/">Home</a>
          <a href="/#network">Network</a>
          <a href="#login" className="navLogin">
            Sign in <span>→</span>
          </a>
        </nav>

        <div className="headerStatus">
          <span className="statusDot" />
          <span>SYSTEM ONLINE</span>
        </div>
      </header>

      <section className="hero" id="home">
        <div className="heroCopy">
          <div className="eyebrow">
            <span /> BUSINESS TECHNOLOGY PLATFORM
          </div>
          <h1>
            CONNECT YOUR <strong>BUSINESS.</strong>
          </h1>
          <p className="heroLead">
            Reliable connectivity, secure access, and modern business systems
            built to keep your operations moving.
          </p>
          <div className="heroMeta">
            <div>
              <strong>01</strong>
              <span>CONNECTED</span>
            </div>
            <div>
              <strong>02</strong>
              <span>SECURE</span>
            </div>
            <div>
              <strong>03</strong>
              <span>READY</span>
            </div>
          </div>
          <div className="networkLegend">
            <div>
              <span className="legendLine" />
              <span>GLOBAL ROUTES</span>
            </div>
            <div>
              <span className="legendPulse" />
              <span>CORE ONLINE</span>
            </div>
          </div>
        </div>

        <div
          className="networkVisual"
          id="network"
          aria-label="PKC BIZOFT global network visualization"
        >
          <div className="globeBackdrop" aria-hidden="true" />
          <div className="globeReadout">
            <span className="readoutDot" />
            <span>GLOBAL NETWORK</span>
            <b>LIVE CONNECTIONS</b>
          </div>

          <div className="globeStage">
            <Globe
              ref={globeRef}
              width={globeSize}
              height={globeSize}
              backgroundColor="rgba(0,0,0,0)"
              globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-dark.jpg"
              bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
              showGraticules={true}
              showAtmosphere={true}
              atmosphereColor="#67e8f9"
              atmosphereAltitude={0.2}
              pointsData={NETWORK_POINTS}
              pointLat="lat"
              pointLng="lng"
              pointColor="color"
              pointAltitude={0.035}
              pointRadius={0.42}
              pointResolution={18}
              pointsMerge={false}
              pointLabel="name"
              arcsData={NETWORK_ARCS}
              arcStartLat="startLat"
              arcStartLng="startLng"
              arcEndLat="endLat"
              arcEndLng="endLng"
              arcColor={() => [
                "rgba(103,232,249,0.06)",
                "#67e8f9",
                "rgba(56,189,248,0.16)",
              ]}
              arcAltitudeAutoScale={0.55}
              arcStroke={0.72}
              arcDashLength={0.24}
              arcDashGap={0.04}
              arcDashAnimateTime={2200}
              arcLabel="name"
              ringsData={NETWORK_RINGS}
              ringLat="lat"
              ringLng="lng"
              ringColor="color"
              ringMaxRadius={3.4}
              ringPropagationSpeed={1.35}
              ringRepeatPeriod={1600}
              labelsData={NETWORK_POINTS}
              labelLat="lat"
              labelLng="lng"
              labelText="name"
              labelColor={() => "#a5f3fc"}
              labelSize={0.62}
              labelAltitude={0.052}
              labelDotRadius={0.24}
              labelIncludeDot={true}
              htmlElementsData={GLOBE_HUD_POINTS}
              htmlLat="lat"
              htmlLng="lng"
              htmlAltitude={0.14}
              htmlTransitionDuration={0}
              htmlElementVisibilityModifier={(
                el: HTMLElement,
                isVisible: boolean,
              ) => {
                el.style.opacity = isVisible ? "1" : "0";
              }}
              htmlElement={(d: any) => {
                const el = document.createElement("div");
                el.className = `geoHudMarker geoHud-${d.icon}`;
                const icon =
                  d.icon === "wifi" ? "⌁" : d.icon === "server" ? "▦" : "☁";
                el.innerHTML = `
                  <span class="geoHudAnchor"></span>
                  <span class="geoHudConnector"></span>
                  <span class="geoHudCard">
                    <span class="geoHudIcon">${icon}</span>
                    <span class="geoHudText">
                      <strong>${d.title}</strong>
                      <small>${d.subtitle}</small>
                      <em><i></i>${d.status}</em>
                    </span>
                  </span>
                `;
                return el;
              }}
              pathsData={NETWORK_ROUTES}
              pathPoints="points"
              pathPointLat="lat"
              pathPointLng="lng"
              pathColor={() => [
                "rgba(103,232,249,0.04)",
                "#67e8f9",
                "rgba(56,189,248,0.16)",
              ]}
              pathStroke={0.65}
              pathDashLength={0.16}
              pathDashGap={0.035}
              pathDashAnimateTime={2100}
              pathTransitionDuration={0}
              animateIn={true}
              enablePointerInteraction={false}
              rendererConfig={{
                antialias: true,
                alpha: true,
                powerPreference: "high-performance",
              }}
              onGlobeReady={handleGlobeReady}
            />
          </div>
          <div className="globeFooterReadout">
            <span>EUROPE</span>
            <i />
            <span>PHILIPPINES</span>
            <i />
            <span>CLOUD</span>
          </div>
        </div>

        <section className="loginCard" id="login" aria-label="Login">
          <div className="cardAccent" />
          <div className="cardHeader">
            <span className="cardKicker">PKC BIZOFT ACCESS</span>
            <h2>Welcome back.</h2>
            <p>Sign in to continue to your business workspace.</p>
          </div>
          <div className="trustBar">
            <span className="trustIcon">✓</span>
            <span>Protected business access</span>
          </div>

          <form onSubmit={handleLogin}>
            <label className="field">
              <span className="fieldIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                  <path d="m4.5 7 7.5 6 7.5-6" />
                </svg>
              </span>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEmailTouched(true)}
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                aria-invalid={
                  emailTouched && email.length > 0 && !email.includes("@")
                }
                required
              />
            </label>
            {emailTouched && email.length > 0 && !email.includes("@") && (
              <p className="fieldHint" role="status">
                Enter a valid email address.
              </p>
            )}

            <label className="field">
              <span className="fieldIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="5" y="10" width="14" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  <circle cx="12" cy="15" r="1" />
                </svg>
              </span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="passwordToggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "◉" : "◌"}
              </button>
            </label>

            <div className="formMeta">
              <label className="remember">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <a href="/forgot-password">Forgot password?</a>
            </div>
            {message && (
              <div className="message" role="alert" aria-live="polite">
                {message}
              </div>
            )}
            <button
              className="loginButton"
              type="submit"
              disabled={loading}
              aria-busy={loading}
            >
              <span>{loading ? "Signing in…" : "Sign in"}</span>
              <span>→</span>
            </button>
          </form>

          <div className="secureNote">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.5 19 6v5.3c0 4.4-2.9 7.9-7 9.2-4.1-1.3-7-4.8-7-9.2V6l7-2.5Z" />
              <path d="m9.4 12 1.7 1.7 3.6-3.8" />
            </svg>
            <span>Secure authentication powered by PKC BIZOFT</span>
          </div>
        </section>
      </section>

      <footer className="footer">
        <span>PKC BIZOFT</span>
        <i />
        <span>BUSINESS TECHNOLOGY PLATFORM</span>
        <span className="footerRight">© 2026</span>
      </footer>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }
        :global(html),
        :global(body) {
          margin: 0;
          min-height: 100%;
          background: #02080c;
        }
        :global(body) {
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }
        :global(a) {
          color: inherit;
          text-decoration: none;
        }

        .page {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          isolation: isolate;
          color: #eaffff;
          background: #02080c;
        }
        .background {
          position: fixed;
          inset: 0;
          z-index: -2;
          pointer-events: none;
          overflow: hidden;
          background: #02080c;
        }
        .ambient {
          position: absolute;
          border-radius: 50%;
          filter: blur(20px);
          opacity: 0.75;
          animation: ambientDrift 12s ease-in-out infinite alternate;
        }
        .ambientOne {
          width: 680px;
          height: 680px;
          top: -360px;
          right: -180px;
          background: radial-gradient(
            circle,
            rgba(0, 199, 255, 0.18),
            rgba(0, 120, 180, 0.06) 42%,
            transparent 72%
          );
        }
        .ambientTwo {
          width: 580px;
          height: 580px;
          bottom: -330px;
          left: -220px;
          background: radial-gradient(
            circle,
            rgba(0, 117, 170, 0.16),
            rgba(0, 75, 110, 0.05) 45%,
            transparent 72%
          );
          animation-delay: -4s;
        }
        .ambientThree {
          width: 420px;
          height: 420px;
          top: 34%;
          left: 43%;
          background: radial-gradient(
            circle,
            rgba(25, 190, 220, 0.07),
            transparent 68%
          );
          animation-delay: -7s;
        }
        .grid {
          position: absolute;
          inset: 0;
          opacity: 0.16;
          background-image:
            linear-gradient(rgba(70, 210, 235, 0.08) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(70, 210, 235, 0.08) 1px,
              transparent 1px
            );
          background-size: 52px 52px;
          mask-image: linear-gradient(
            to bottom,
            black 0%,
            rgba(0, 0, 0, 0.7) 72%,
            transparent 100%
          );
        }
        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            circle at center,
            transparent 35%,
            rgba(0, 4, 7, 0.55) 100%
          );
        }

        .header {
          position: relative;
          z-index: 10;
          width: min(1420px, calc(100% - 56px));
          margin: 0 auto;
          min-height: 86px;
          display: flex;
          align-items: center;
          gap: 28px;
        }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .brandLogo {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: rgba(5, 27, 38, 0.42);
          box-shadow: 0 0 26px rgba(0, 190, 255, 0.08);
          overflow: hidden;
        }
        .brandLogo img {
          width: 34px;
          height: 34px;
          object-fit: contain;
        }
        .brandText {
          font-size: 15px;
          letter-spacing: 0.08em;
          font-weight: 800;
          color: #eaffff;
        }
        .brandText strong {
          color: #67e8f9;
          font-weight: 800;
        }
        .nav {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
        }
        .nav a {
          position: relative;
          padding: 9px 13px;
          border: 1px solid transparent;
          border-radius: 9px;
          color: #78929d;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          transition:
            color 0.2s ease,
            background 0.2s ease,
            border-color 0.2s ease;
        }
        .nav a:hover {
          color: #dffcff;
          background: rgba(103, 232, 249, 0.05);
          border-color: rgba(103, 232, 249, 0.12);
        }
        .navLogin {
          color: #b9f7ff !important;
          border-color: rgba(103, 232, 249, 0.22) !important;
          background: rgba(103, 232, 249, 0.06);
        }
        .navLogin span {
          margin-left: 6px;
          color: #67e8f9;
        }
        .headerStatus {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-left: 6px;
          color: #7f9ca7;
          font-size: 10px;
          letter-spacing: 0.16em;
          font-weight: 700;
        }
        .statusDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #4de1aa;
          box-shadow: 0 0 12px rgba(77, 225, 170, 0.9);
          animation: pulse 1.8s ease-in-out infinite;
        }

        .hero {
          position: relative;
          z-index: 2;
          width: min(1420px, calc(100% - 56px));
          margin: 0 auto;
          min-height: calc(100vh - 148px);
          display: grid;
          grid-template-columns: minmax(300px, 0.86fr) minmax(
              480px,
              1.28fr
            ) minmax(330px, 0.8fr);
          align-items: center;
          gap: 30px;
          padding: 42px 0 48px;
        }
        .heroCopy {
          position: relative;
          z-index: 4;
          max-width: 470px;
          animation: enterLeft 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 22px;
          color: #67e8f9;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.18em;
        }
        .eyebrow span {
          width: 26px;
          height: 1px;
          background: #67e8f9;
          box-shadow: 0 0 10px rgba(103, 232, 249, 0.8);
        }
        .heroCopy h1 {
          margin: 0;
          font-size: clamp(48px, 5.2vw, 76px);
          line-height: 0.94;
          letter-spacing: -0.055em;
          font-weight: 300;
        }
        .heroCopy h1 strong {
          display: block;
          color: #bdf7ff;
          font-weight: 700;
        }
        .heroLead {
          margin: 26px 0 0;
          max-width: 440px;
          color: #91aeb8;
          font-size: 16px;
          line-height: 1.7;
        }
        .heroMeta {
          display: flex;
          gap: 24px;
          margin-top: 34px;
          padding-top: 18px;
          border-top: 1px solid rgba(103, 232, 249, 0.1);
        }
        .heroMeta div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .heroMeta strong {
          color: #67e8f9;
          font-size: 11px;
          letter-spacing: 0.12em;
        }
        .heroMeta span {
          color: #78929d;
          font-size: 9px;
          letter-spacing: 0.14em;
          font-weight: 700;
        }
        .networkLegend {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 26px;
          color: #78929d;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.13em;
        }
        .networkLegend div {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .legendLine {
          width: 25px;
          height: 1px;
          background: #67e8f9;
          box-shadow: 0 0 8px rgba(103, 232, 249, 0.7);
        }
        .legendPulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4de1aa;
          box-shadow: 0 0 9px rgba(77, 225, 170, 0.8);
        }

        .networkVisual {
          position: relative;
          min-height: 640px;
          overflow: visible;
          display: grid;
          place-items: center;
          padding: 8px 18px;
          animation: enterUp 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both 0.05s;
        }
        .globeBackdrop {
          position: absolute;
          width: 590px;
          height: 590px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(0, 130, 165, 0.09),
            rgba(0, 78, 106, 0.035) 45%,
            transparent 72%
          );
          filter: blur(3px);
        }
        .globeStage {
          position: relative;
          z-index: 2;
          width: min(100%, 560px);
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          overflow: visible;
          padding: 50px;
        }
        .globeStage > div,
        .globeStage > div > div,
        .globeStage > div > div > div {
          overflow: visible !important;
        }
        .globeStage canvas {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }
        .globeReadout {
          position: absolute;
          top: 26px;
          left: 50%;
          z-index: 5;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid rgba(103, 232, 249, 0.13);
          border-radius: 999px;
          background: rgba(2, 16, 23, 0.78);
          backdrop-filter: blur(10px);
          color: #7fa5af;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.14em;
          white-space: nowrap;
        }
        .globeReadout b {
          color: #67e8f9;
          font-weight: 800;
        }
        .readoutDot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #67e8f9;
          box-shadow: 0 0 11px rgba(103, 232, 249, 0.9);
          animation: pulse 1.7s ease-in-out infinite;
        }
        .globeFooterReadout {
          position: absolute;
          bottom: 34px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 9px;
          color: #5f7c87;
          font-size: 8px;
          letter-spacing: 0.14em;
          font-weight: 800;
          white-space: nowrap;
        }
        .globeFooterReadout i {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #67e8f9;
          box-shadow: 0 0 7px rgba(103, 232, 249, 0.8);
        }

        :global(.geoHudMarker) {
          position: relative;
          z-index: 20;
          width: 1px;
          height: 1px;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        :global(.geoHudAnchor) {
          position: absolute;
          left: 0;
          top: 0;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: #d7fbff;
          box-shadow:
            0 0 0 4px rgba(103, 232, 249, 0.1),
            0 0 14px rgba(103, 232, 249, 1);
        }
        :global(.geoHudConnector) {
          position: absolute;
          left: 0;
          top: -34px;
          width: 1px;
          height: 34px;
          transform: translateX(-50%);
          background: linear-gradient(
            to top,
            rgba(103, 232, 249, 0.9),
            rgba(103, 232, 249, 0.08)
          );
          box-shadow: 0 0 7px rgba(103, 232, 249, 0.45);
        }
        :global(.geoHudCard) {
          position: absolute;
          left: 0;
          bottom: 34px;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 178px;
          padding: 10px 12px;
          border: 1px solid rgba(103, 232, 249, 0.22);
          border-radius: 10px;
          background: linear-gradient(
            135deg,
            rgba(3, 30, 42, 0.94),
            rgba(2, 15, 24, 0.9)
          );
          box-shadow:
            0 10px 28px rgba(0, 0, 0, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
        }
        :global(.geoHudIcon) {
          width: 29px;
          height: 29px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid rgba(103, 232, 249, 0.22);
          border-radius: 8px;
          color: #67e8f9;
          font-size: 16px;
          background: rgba(103, 232, 249, 0.06);
        }
        :global(.geoHudText) {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        :global(.geoHudText strong) {
          color: #dffcff;
          font-size: 9px;
          letter-spacing: 0.1em;
          white-space: nowrap;
        }
        :global(.geoHudText small) {
          color: #7896a0;
          font-size: 8px;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }
        :global(.geoHudText em) {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #57dca8;
          font-size: 7px;
          font-style: normal;
          font-weight: 800;
          letter-spacing: 0.12em;
        }
        :global(.geoHudText em i) {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #57dca8;
          box-shadow: 0 0 7px rgba(87, 220, 168, 0.9);
          animation: pulse 1.5s ease-in-out infinite;
        }

        :global(.geoHud-europe .geoHudCard),
        :global(.geoHud-cloud .geoHudCard) {
          top: 20px;
          bottom: auto;
          left: 12px;
          transform: none;
        }
        :global(.geoHud-europe .geoHudConnector),
        :global(.geoHud-cloud .geoHudConnector) {
          top: 8px;
          height: 20px;
          transform: translateX(-50%);
          background: linear-gradient(
            to bottom,
            rgba(103, 232, 249, 0.9),
            rgba(103, 232, 249, 0.08)
          );
        }
        :global(.geoHud-philippines .geoHudCard) {
          left: 14px;
          bottom: 28px;
          transform: translateX(0);
        }
        :global(.geoHud-philippines .geoHudConnector) {
          left: 8px;
          top: -28px;
          height: 28px;
        }

        .loginCard {
          position: relative;
          z-index: 5;
          width: 100%;
          max-width: 390px;
          justify-self: end;
          padding: 31px;
          border: 1px solid rgba(103, 232, 249, 0.16);
          border-radius: 20px;
          background: linear-gradient(
            145deg,
            rgba(7, 25, 34, 0.95),
            rgba(3, 13, 19, 0.95)
          );
          box-shadow:
            0 30px 80px rgba(0, 0, 0, 0.34),
            0 0 55px rgba(0, 145, 190, 0.07),
            inset 0 1px 0 rgba(255, 255, 255, 0.035);
          backdrop-filter: blur(18px);
          animation: enterRight 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both 0.08s;
          overflow: hidden;
        }
        .loginCard::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(103, 232, 249, 0.045),
            transparent 32%,
            transparent 70%,
            rgba(0, 150, 200, 0.035)
          );
          pointer-events: none;
        }
        .cardAccent {
          position: absolute;
          top: 0;
          left: 28px;
          right: 28px;
          height: 2px;
          background: linear-gradient(90deg, transparent, #67e8f9, transparent);
          box-shadow: 0 0 15px rgba(103, 232, 249, 0.7);
        }
        .cardHeader {
          position: relative;
        }
        .cardKicker {
          color: #67e8f9;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.16em;
        }
        .cardHeader h2 {
          margin: 10px 0 7px;
          color: #ecfeff;
          font-size: 30px;
          line-height: 1.1;
          letter-spacing: -0.035em;
        }
        .cardHeader p {
          margin: 0;
          color: #809ca6;
          font-size: 13px;
          line-height: 1.6;
        }
        .trustBar {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 21px 0 18px;
          padding: 10px 12px;
          border: 1px solid rgba(77, 225, 170, 0.1);
          border-radius: 10px;
          background: rgba(77, 225, 170, 0.045);
          color: #83b2a1;
          font-size: 11px;
        }
        .trustIcon {
          width: 19px;
          height: 19px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #05140f;
          background: #57dca8;
          font-size: 11px;
          font-weight: 900;
        }
        form {
          position: relative;
        }
        .field {
          position: relative;
          display: flex;
          align-items: center;
          margin-top: 13px;
          border: 1px solid rgba(103, 232, 249, 0.12);
          border-radius: 11px;
          background: rgba(1, 11, 16, 0.72);
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }
        .field:focus-within {
          border-color: rgba(103, 232, 249, 0.45);
          background: rgba(2, 18, 25, 0.88);
          box-shadow:
            0 0 0 3px rgba(103, 232, 249, 0.06),
            0 0 22px rgba(103, 232, 249, 0.04);
        }
        .fieldIcon {
          width: 46px;
          display: grid;
          place-items: center;
          color: #5c8793;
        }
        .fieldIcon svg {
          width: 18px;
          height: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.6;
        }
        .field input {
          width: 100%;
          min-width: 0;
          padding: 14px 44px 14px 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #e8fdff;
          font: inherit;
          font-size: 14px;
        }
        .field input::placeholder {
          color: #55727d;
        }
        .passwordToggle {
          position: absolute;
          right: 11px;
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          color: #71909b;
          cursor: pointer;
          font-size: 17px;
        }
        .passwordToggle:hover {
          color: #67e8f9;
        }
        .fieldHint {
          margin: 6px 4px 0;
          color: #fca5a5;
          font-size: 11px;
        }
        .formMeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin: 14px 2px 18px;
          color: #718d97;
          font-size: 11px;
        }
        .remember {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
        }
        .remember input {
          accent-color: #67e8f9;
        }
        .formMeta a {
          color: #67cfe2;
        }
        .formMeta a:hover {
          color: #a8f5ff;
        }
        .message {
          margin-bottom: 14px;
          padding: 10px 12px;
          border: 1px solid rgba(248, 113, 113, 0.2);
          border-radius: 9px;
          background: rgba(127, 29, 29, 0.16);
          color: #fecaca;
          font-size: 12px;
          line-height: 1.45;
        }
        .loginButton {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border: 1px solid rgba(103, 232, 249, 0.4);
          border-radius: 11px;
          background: linear-gradient(100deg, #0788ad, #0b6e94);
          color: #efffff;
          box-shadow: 0 12px 28px rgba(0, 119, 160, 0.18);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.04em;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            filter 0.2s ease;
        }
        .loginButton:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 16px 34px rgba(0, 150, 200, 0.22);
          filter: brightness(1.08);
        }
        .loginButton:disabled {
          opacity: 0.62;
          cursor: wait;
        }
        .secureNote {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 20px;
          padding-top: 17px;
          border-top: 1px solid rgba(103, 232, 249, 0.08);
          color: #5e7984;
          font-size: 10px;
          line-height: 1.4;
        }
        .secureNote svg {
          width: 17px;
          height: 17px;
          flex: 0 0 auto;
          fill: none;
          stroke: #67e8f9;
          stroke-width: 1.5;
        }

        .footer {
          position: relative;
          z-index: 4;
          width: min(1420px, calc(100% - 56px));
          margin: 0 auto;
          min-height: 62px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-top: 1px solid rgba(103, 232, 249, 0.09);
          color: #506a75;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.14em;
        }
        .footer i {
          width: 18px;
          height: 1px;
          background: rgba(103, 232, 249, 0.35);
        }
        .footerRight {
          margin-left: auto;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 0.6;
            transform: scale(0.88);
          }
          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }
        @keyframes ambientDrift {
          from {
            transform: translate3d(0, 0, 0) scale(1);
          }
          to {
            transform: translate3d(18px, -14px, 0) scale(1.05);
          }
        }
        @keyframes enterLeft {
          from {
            opacity: 0;
            transform: translateX(-24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes enterRight {
          from {
            opacity: 0;
            transform: translateX(24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes enterUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 1180px) {
          .hero {
            grid-template-columns: minmax(280px, 0.85fr) minmax(390px, 1.1fr);
            gap: 10px 18px;
          }
          .heroCopy {
            grid-column: 1;
            grid-row: 1;
            align-self: center;
          }
          .networkVisual {
            grid-column: 2;
            grid-row: 1;
            min-height: 560px;
          }
          .loginCard {
            grid-column: 1 / -1;
            justify-self: center;
            max-width: 500px;
            margin-top: -8px;
          }
        }

        @media (max-width: 820px) {
          .header,
          .hero,
          .footer {
            width: min(100% - 34px, 680px);
          }
          .header {
            gap: 14px;
          }
          .nav {
            gap: 2px;
          }
          .nav a {
            padding: 8px 9px;
            font-size: 9px;
          }
          .headerStatus {
            display: none;
          }
          .hero {
            display: flex;
            flex-direction: column;
            min-height: auto;
            padding: 44px 0 40px;
            gap: 26px;
          }
          .heroCopy {
            width: 100%;
            max-width: 620px;
          }
          .networkVisual {
            width: 100%;
            min-height: 400px;
          }
          .loginCard {
            max-width: 520px;
            margin: 0;
          }
          .globeBackdrop {
            width: 440px;
            height: 440px;
          }
          .globeStage {
            width: min(100%, 470px);
            padding: 34px;
          }
          .globeReadout {
            top: 15px;
          }
          .globeFooterReadout {
            bottom: 18px;
          }
          .heroCopy h1 {
            font-size: clamp(46px, 10vw, 66px);
          }
        }

        @media (max-width: 560px) {
          .header {
            min-height: 72px;
          }
          .brandLogo {
            width: 38px;
            height: 38px;
          }
          .brandLogo img {
            width: 30px;
            height: 30px;
          }
          .brandText {
            font-size: 13px;
          }
          .nav a {
            padding: 7px 6px;
            font-size: 8px;
          }
          .nav a[href="#network"] {
            display: none;
          }
          .hero {
            width: min(100% - 24px, 520px);
            padding-top: 32px;
          }
          .eyebrow {
            font-size: 9px;
            letter-spacing: 0.14em;
          }
          .heroLead {
            font-size: 14px;
            line-height: 1.65;
          }
          .heroMeta {
            gap: 18px;
            margin-top: 28px;
          }
          .networkLegend {
            margin-top: 22px;
          }
          .networkVisual {
            min-height: 330px;
            margin-top: -4px;
          }
          .globeBackdrop {
            width: 330px;
            height: 330px;
          }
          .globeStage {
            width: 360px;
            padding: 26px;
          }
          .globeReadout {
            font-size: 7px;
            padding: 7px 9px;
          }
          .globeFooterReadout {
            font-size: 7px;
          }
          :global(.geoHudCard) {
            min-width: 145px;
            padding: 7px 8px;
            gap: 7px;
          }
          :global(.geoHudIcon) {
            width: 25px;
            height: 25px;
            font-size: 13px;
          }
          :global(.geoHudText strong) {
            font-size: 7px;
          }
          :global(.geoHudText small) {
            font-size: 6.5px;
          }
          :global(.geoHudText em) {
            font-size: 6px;
          }
          .loginCard {
            padding: 25px 20px 22px;
            border-radius: 16px;
          }
          .cardHeader h2 {
            font-size: 27px;
          }
          .footer {
            min-height: 54px;
            flex-wrap: wrap;
            gap: 7px;
            padding: 12px 0;
            font-size: 7px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ambient,
          .statusDot,
          .readoutDot,
          :global(.geoHudText em i),
          .heroCopy,
          .networkVisual,
          .loginCard {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
}
