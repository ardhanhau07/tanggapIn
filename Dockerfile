FROM nginx:alpine

COPY . /usr/share/nginx/html

EXPOSE 80

# Jalankan Nginx
CMD ["nginx", "-g", "daemon off;"]