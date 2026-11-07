/** Configuración de Tailwind CSS v3 — se usa solo para generar static/css/app.css */
module.exports = {
  content: ["./templates/**/*.html", "./static/js/**/*.js"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Montserrat", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
