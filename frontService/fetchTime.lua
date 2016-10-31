if redis.call("EXISTS", KEYS[1]) == 1 then
    if ARGV[1] - redis.call("GET", KEYS[1]) > 1000 then
        redis.call("SET", KEYS[1], ARGV[1]);
        return true;
    else
        return false 
    end
else
    redis.call("SET", KEYS[1], ARGV[1]);
    return true;
end
