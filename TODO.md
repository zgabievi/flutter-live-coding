# Setup

1. Make sure you have Docker.app installed and opened (https://www.docker.com/products/docker-desktop/)
2. Make sure you have PHP & Composer installed (to install run: `/bin/bash -c "$(curl -fsSL https://php.new/install/mac/8.4)"`)
3. Run `cp .env.example .env`
4. Run `composer update`
5. Run `./vendor/bin/sail up`
6. Run `./vendor/bin/sail npm install`
7. Run `./vendor/bin/sail npm run build`
8. Run `./vendor/bin/sail php artisan key:generate`
9. Run `./vendor/bin/sail php artisan migrate --seed`
10. Account created with credentials: `flutter-employee@example.com` / `password`

# Tasks

1. Update models: *Order*, *Product*, *OrderProduct*
    * Add casts to the models
    * Make title & description translatable

2. Setup nova resources for: *Order* & *Product*
    * Order fields: User, Total Amount, Status, Create Date
    * Product fields: Title, Slug, Description, Price, Stock, Image, Is Active, Create Date
    * Setup filter for active products
    * Setup filter for order statuses

3. Create command to cache data
    * Create console command that will fetch active products
    * Store active products in Redis database
    * Create api endpoint that will fetch those data and return as api resource

4. Create macro for http request
    * Open *routes/api.php* and refactor file using instructions bellow
    * Create http request macro for `https://jsonplaceholder.typicode.com/`
    * It should be called like following `Http::jsonPlaceholder()->get('/todos/1');`
