# Setup

1. Run `composer update`
2. Run `./vendor/bin/sail up`
3. Run `./vendor/bin/sail php artisan migrate --seed`
4. Account created with credentials: `flutter-employee@example.com` / `password`

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
    * Create http request macro for `https://jsonplaceholder.typicode.com/todos/1`
    * It should be called like following `Http::jsonPlaceholder()->get('/todos/1');`
