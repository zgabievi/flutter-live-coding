<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Order;
use App\Models\User;
use App\Models\Product;

class OrderSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Order::factory()
            ->count(10)
            ->for(User::factory())
            ->hasAttached(Product::factory()->count(3), [
                'quantity' => fake()->numberBetween(1, 5),
                'price' => fake()->randomFloat(2, 1, 100),
            ])
            ->create();
    }
}
